import { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer } from '../../kafka'; // Main Kafka consumer factory
import ExchangeService from './exchange.service'; // To place orders
import StrategyConfigService from './strategyConfig.service'; // To update strategy status if needed
import { query as pgQuery } from '../../database/timescaledb'; // TimescaleDB query function
import { AppError, HttpCode } from '../../utils/appError';
import { Order as CcxtOrder } from 'ccxt'; // CCXT's Order type

const KAFKA_TRADING_SIGNALS_TOPIC = 'trading.signals';
const GROUP_ID = 'trading-signal-order-executor-group';

// Define the structure of a trading signal message expected from Kafka
interface TradingSignal {
  strategyConfigId: string;
  strategyName: string;
  userId: string; // Important for context, though ExchangeService uses configId which implies user
  exchangeConfigId: string; // ID of the ExchangeConfig to use for this order
  exchange: string; // Name of the exchange, e.g., 'binance'
  symbol: string;   // Trading symbol, e.g., 'BTC/USDT'
  signal: 'BUY' | 'SELL';
  price?: number;    // Target price (e.g., from ticker at time of signal, or strategy's limit price)
  orderType?: 'market' | 'limit'; // Default to market if not specified
  amount?: number;   // Amount to trade in base currency (e.g., BTC amount for BTC/USDT)
  quoteAmount?: number; // Amount in quote currency (e.g., USDT amount for BTC/USDT) - one of amount/quoteAmount needed
  timestamp: string;  // ISO string timestamp of when signal was generated
  parameters?: any;  // Original strategy parameters that generated signal
  // Optional: confidence, stopLoss, takeProfit, leverage etc. from strategy
  stopLossPrice?: number;
  takeProfitPrice?: number;
  leverage?: number;
}

let consumer: Consumer | null = null;

const messageHandler = async ({ topic, partition, message }: { topic: string; partition: number; message: any /* KafkaMessage */ }): Promise<void> => {
  if (!message.value) {
    console.warn(\`[OrderExecutor] Received empty message from topic \${topic}\`);
    return;
  }

  let signalData: TradingSignal;
  try {
    signalData = JSON.parse(message.value.toString());
  } catch (error) {
    console.error(\`[OrderExecutor] Failed to parse trading signal JSON from topic \${topic}:\`, error);
    // Potentially send to DLQ
    return;
  }

  console.log(\`[OrderExecutor] Received trading signal for \${signalData.symbol} on \${signalData.exchange}: \${signalData.signal}\`, signalData);

  // --- Basic Validations ---
  if (!signalData.exchangeConfigId || !signalData.userId || !signalData.symbol || !signalData.signal) {
    console.error('[OrderExecutor] Invalid signal data received (missing crucial fields):', signalData);
    return;
  }
  if (signalData.signal !== 'BUY' && signalData.signal !== 'SELL') {
    console.error(\`[OrderExecutor] Invalid signal type '\${signalData.signal}'. Must be BUY or SELL.\`);
    return;
  }
  if (!signalData.amount && !signalData.quoteAmount) {
      console.error('[OrderExecutor] Order amount (base or quote) not specified in signal:', signalData);
      return;
  }


  // --- 1. Risk Management (Placeholder) ---
  // TODO: Implement actual risk management checks:
  // - Check user's available balance for the asset on the specific exchange.
  // - Check overall portfolio exposure.
  // - Check strategy-specific limits (e.g., max open positions, max loss per day).
  // - Check market conditions (e.g., slippage, liquidity).
  console.log(\`[OrderExecutor] Performing risk checks for signal on \${signalData.symbol} (placeholder)...\`);
  const riskCheckPassed = true; // Assume passed for now
  if (!riskCheckPassed) {
    console.warn(\`[OrderExecutor] Risk check failed for signal on \${signalData.symbol}. Order not placed.\`);
    // Optionally update strategy status or notify user
    StrategyConfigService.updateStrategyStatus(signalData.strategyConfigId, 'running', \`Risk check failed for \${signalData.signal} \${signalData.symbol}\`).catch(e => {});
    return;
  }

  // --- 2. Determine Order Parameters ---
  const orderType = signalData.orderType || 'market'; // Default to market order
  const amountToTrade = signalData.amount; // Use base currency amount if provided
  // If only quoteAmount is provided for a market order, CCXT might handle it for some exchanges,
  // or we might need to calculate base amount based on current price.
  // For now, assume 'amount' (base currency amount) is the primary way if specified.
  // If type is 'limit', signalData.price should be used. If market, price is not needed for createOrder.
  const price = orderType === 'limit' ? signalData.price : undefined;

  if (orderType === 'limit' && !price) {
      console.error(\`[OrderExecutor] Limit order signal for \${signalData.symbol} missing price.\`);
      StrategyConfigService.updateStrategyStatus(signalData.strategyConfigId, 'error', \`Limit order signal missing price for \${signalData.signal} \${signalData.symbol}\`).catch(e => {});
      return;
  }

  // CCXT createOrder expects 'amount' in base currency.
  // If only quoteAmount is provided, we would need to fetch current price and convert.
  // This is simplified for now. Assume `amountToTrade` is correctly specified or derived.
  if (!amountToTrade) {
      // TODO: Logic to derive base 'amount' if only 'quoteAmount' is given,
      // e.g., fetch ticker, calculate amount = quoteAmount / price.
      // This adds latency and complexity (potential race conditions).
      console.error(\`[OrderExecutor] Base currency trade amount not available for \${signalData.symbol}. quoteAmount handling not fully implemented yet.\`);
      StrategyConfigService.updateStrategyStatus(signalData.strategyConfigId, 'error', \`Order amount calculation failed for \${signalData.signal} \${signalData.symbol}\`).catch(e => {});
      return;
  }

  // Construct params for CCXT, including leverage, SL/TP if supported by exchange & signal
  const ccxtParams: any = {};
  if (signalData.leverage) ccxtParams.leverage = signalData.leverage;
  // Note: SL/TP handling in CCXT is exchange-specific. Often set via 'params' object.
  // e.g., params: { 'stopLoss': { 'type': 'limit', 'price': slPrice }, 'takeProfit': { 'price': tpPrice } }
  // This needs to be tailored per exchange.
  if (signalData.stopLossPrice) ccxtParams.stopLoss = signalData.stopLossPrice; // Simplified, actual params vary
  if (signalData.takeProfitPrice) ccxtParams.takeProfit = signalData.takeProfitPrice; // Simplified


  // --- 3. Place Order via ExchangeService ---
  let placedOrder: CcxtOrder | null = null;
  try {
    console.log(\`[OrderExecutor] Attempting to place \${signalData.signal} \${orderType} order for \${amountToTrade} \${signalData.symbol} on \${signalData.exchange} via config \${signalData.exchangeConfigId}\`);
    placedOrder = await ExchangeService.createOrder(
      signalData.exchangeConfigId,
      signalData.userId, // Pass userId for context, though ExchangeService uses configId
      signalData.symbol,
      orderType,
      signalData.signal.toLowerCase() as 'buy' | 'sell',
      amountToTrade,
      price,
      ccxtParams
    );
    console.log(\`[OrderExecutor] Order placed successfully for \${signalData.symbol}. Order ID: \${placedOrder.id}\`, placedOrder);
    StrategyConfigService.updateStrategyStatus(signalData.strategyConfigId, 'running', \`Order \${placedOrder.id} placed: \${signalData.signal} \${amountToTrade} \${signalData.symbol}\`).catch(e => {});

  } catch (error: any) {
    console.error(\`[OrderExecutor] Failed to place order for \${signalData.symbol} via config \${signalData.exchangeConfigId}:\`, error.message);
    StrategyConfigService.updateStrategyStatus(signalData.strategyConfigId, 'error', \`Order placement failed: \${error.message}\`).catch(e => {});
    // TODO: More sophisticated error handling, e.g., retries for temporary issues, notifications.
    return; // Stop processing this signal if order placement failed
  }

  // --- 4. Log Order to Database (bot_orders table) ---
  if (placedOrder) {
    try {
      // TODO: Get internal symbol_id from 'symbols' table based on placedOrder.symbol and signalData.exchange
      const symbolIdPlaceholder = 1; // Replace with actual lookup
      const strategyIdPlaceholder = signalData.strategyConfigId; // Assuming strategyConfigId is ObjectId string

      const orderInsertSql = \`
        INSERT INTO bot_orders (strategy_id, user_id, exchange_order_id, exchange, symbol_id, type, side, price, quantity, status, leverage, margin_type, created_at, updated_at)
        VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$14)
        RETURNING id;
      \`;
      // Use 'average' for filled price, 'price' for limit price. 'cost' for total cost.
      // 'status' from CCXT can be 'open', 'closed', 'canceled'.
      const dbOrder = await pgQuery(orderInsertSql, [
        strategyIdPlaceholder, // This should be the ObjectId of the strategyConfig
        signalData.userId,
        placedOrder.id,
        signalData.exchange.toLowerCase(),
        symbolIdPlaceholder,
        placedOrder.type,
        placedOrder.side,
        placedOrder.price || null, // Limit price
        placedOrder.amount, // Amount requested
        placedOrder.status,
        signalData.leverage || (placedOrder.info as any)?.leverage || 1, // Leverage from signal or order info
        (placedOrder.info as any)?.marginType || 'isolated', // Margin type if available
        new Date(placedOrder.timestamp),
        new Date(placedOrder.lastTradeTimestamp || placedOrder.timestamp)
      ]);
      const botOrderId = dbOrder.rows[0]?.id;
      console.log(\`[OrderExecutor] Bot order \${botOrderId} logged to database for exchange order \${placedOrder.id}\`);

      // --- 5. Log Transactions if order filled immediately (bot_transactions table) ---
      // This part is more complex as market orders might fill in parts (multiple trades).
      // CCXT 'placedOrder.trades' might contain initial fill info for market orders if available.
      // A separate process might be needed to poll order status and record transactions accurately.
      // For now, if 'placedOrder.trades' exists and has items, log them.
      if (placedOrder.trades && placedOrder.trades.length > 0) {
        for (const trade of placedOrder.trades) {
          const tradeInsertSql = \`
            INSERT INTO bot_transactions (bot_order_id, user_id, exchange, symbol_id, price, quantity, fee, fee_currency, transaction_time)
            VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9);
          \`;
          await pgQuery(tradeInsertSql, [
            botOrderId,
            signalData.userId,
            signalData.exchange.toLowerCase(),
            symbolIdPlaceholder,
            trade.price,
            trade.amount,
            trade.fee?.cost || null,
            trade.fee?.currency || null,
            new Date(trade.timestamp)
          ]);
           console.log(\`[OrderExecutor] Logged transaction for bot order \${botOrderId}, trade ID \${trade.id}\`);
        }
      } else if (placedOrder.status === 'closed' && placedOrder.filled && placedOrder.filled > 0) {
          // If order is closed and filled but no trades array, log a single transaction based on order details
          const tradeInsertSql = \`
            INSERT INTO bot_transactions (bot_order_id, user_id, exchange, symbol_id, price, quantity, fee, fee_currency, transaction_time)
            VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9);
          \`;
          await pgQuery(tradeInsertSql, [
            botOrderId,
            signalData.userId,
            signalData.exchange.toLowerCase(),
            symbolIdPlaceholder,
            placedOrder.average || placedOrder.price, // average filled price or limit price
            placedOrder.filled, // filled amount
            placedOrder.fee?.cost || null,
            placedOrder.fee?.currency || null,
            new Date(placedOrder.lastTradeTimestamp || placedOrder.timestamp)
          ]);
          console.log(\`[OrderExecutor] Logged single transaction for fully filled bot order \${botOrderId}\`);
      }


    } catch (dbError: any) {
      console.error(\`[OrderExecutor] Failed to log order/transaction to database for signal on \${signalData.symbol}:\`, dbError.message);
      // This is problematic as order was placed but not logged. Requires monitoring/reconciliation.
    }
  }
};

export const startOrderExecutionConsumer = async (): Promise<void> => {
  if (consumer) {
    console.log('[OrderExecutor] Consumer already running.');
    return;
  }
  try {
    consumer = createConsumer(GROUP_ID, {
        // Increase session timeout and rebalance timeout if processing takes time
        // sessionTimeout: 60000,
        // rebalanceTimeout: 120000,
        // Consider disabling autoCommit and committing manually after successful processing
        // autoCommit: false,
    });
    await consumer.connect();
    await consumer.subscribe({ topic: KAFKA_TRADING_SIGNALS_TOPIC, fromBeginning: false });

    console.log(\`[OrderExecutor] Subscribed to topic: \${KAFKA_TRADING_SIGNALS_TOPIC}\`);

    await consumer.run({
      eachMessage: messageHandler,
    });
    console.log('[OrderExecutor] Consumer started and processing trading signals.');
  } catch (error) {
    console.error('[OrderExecutor] Failed to start signal consumer:', error);
    consumer = null;
  }
};

export const stopOrderExecutionConsumer = async (): Promise<void> => {
  if (consumer) {
    try {
      await consumer.disconnect();
      console.log('[OrderExecutor] Signal consumer disconnected.');
    } catch (error) {
      console.error('[OrderExecutor] Failed to disconnect signal consumer:', error);
    } finally {
      consumer = null;
    }
  } else {
    console.log('[OrderExecutor] Signal consumer was not running.');
  }
};
