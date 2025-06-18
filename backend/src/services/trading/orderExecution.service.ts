import { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer } from '../../kafka'; // Main Kafka consumer factory
import ExchangeService from './exchange.service'; // To place orders
import RiskManagementService, { ProposedOrderContext } from '../risk/riskManagement.service';
import { getRedisClient, getTickerKey, isRedisConnected } from '../../redis'; // For fetching current price if needed for USD value estimation
import NotificationService from '../notifications/notification.service';
import User from '../../models/mongodb/user.model'; // To fetch user details for notification
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

  // TODO:LOGGING: Structured log for received signal (include all relevant signalData fields).
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


  // --- 1. Risk Management ---
  console.log(\`[OrderExecutor] Performing pre-trade risk checks for signal on \${signalData.symbol}...\`);
  // Estimate order value in USD (very simplified, assumes quote is USD or price is in USD)
  // A more robust solution would use a price oracle or fetch current ticker for non-limit orders.
  let estimatedOrderValueUSD = 0;
  const amountToTrade = signalData.amount; // Base amount from signal
  const price = signalData.orderType === 'limit' ? signalData.price : undefined; // Limit price from signal

  if (signalData.orderType === 'limit' && price && amountToTrade) {
    estimatedOrderValueUSD = price * amountToTrade; // Assumes price is in USD or quote is USD
  } else if (amountToTrade && signalData.price) { // For market orders where signal might include indicative current price
    estimatedOrderValueUSD = signalData.price * amountToTrade;
  } else if (amountToTrade && isRedisConnected()) { // Fallback to Redis ticker for market orders
      try {
          const redisClient = getRedisClient();
          const tickerKey = getTickerKey(signalData.exchange, signalData.symbol);
          const tickerData = await redisClient.hGetAll(tickerKey);
          if (tickerData && tickerData.last) {
              estimatedOrderValueUSD = amountToTrade * parseFloat(tickerData.last);
              console.log(\`[OrderExecutor] Estimated market order value using Redis ticker: \${estimatedOrderValueUSD} USD for \${amountToTrade} \${signalData.symbol}\`);
          } else {
              console.warn(\`[OrderExecutor] Could not get current price from Redis for \${signalData.symbol} to estimate USD value for risk check. Using 0.\`);
          }
      } catch (e) {
          console.warn(\`[OrderExecutor] Error fetching ticker for USD value estimation: \${e}. Using 0.\`);
      }
  }

  const orderContextForRisk: ProposedOrderContext & { strategyId?: string, estimatedOrderValueUSD: number } = {
    userId: signalData.userId,
    exchangeConfigId: signalData.exchangeConfigId,
    exchange: signalData.exchange,
    symbol: signalData.symbol,
    orderType: signalData.orderType || 'market',
    side: signalData.signal.toLowerCase() as 'buy' | 'sell',
    amount: amountToTrade || 0, // Ensure amountToTrade is defined or default to 0
    price: price, // This is the limit price for limit orders, or undefined for market
    strategyId: signalData.strategyConfigId,
    estimatedOrderValueUSD: estimatedOrderValueUSD,
  };

  const riskResult = await RiskManagementService.preTradeCheck(orderContextForRisk);
  if (!riskResult.passed) {
    console.warn(\`[OrderExecutor] Risk check failed for signal on \${signalData.symbol}: \${riskResult.reason}\`);
    StrategyConfigService.updateStrategyStatus(signalData.strategyConfigId, 'error', \`Risk check failed: \${riskResult.reason || 'Unknown risk reason'}\`).catch(e => {});
    return; // Stop processing this signal
  }
  console.log(\`[OrderExecutor] Pre-trade risk checks passed for \${signalData.symbol}.\`);

  // --- 2. Determine Order Parameters ---
  const orderType = signalData.orderType || 'market'; // Default to market order
  // amountToTrade and price are already defined above for risk check

  if (orderType === 'limit' && !price) { // Price is already defined from signalData.price for limit orders
      console.error(\`[OrderExecutor] Limit order signal for \${signalData.symbol} missing price.\`);
      StrategyConfigService.updateStrategyStatus(signalData.strategyConfigId, 'error', \`Limit order signal missing price for \${signalData.signal} \${signalData.symbol}\`).catch(e => {});
      return;
  }

  // Ensure amountToTrade is valid (it was used in risk check, should be defined if risk check passed for non-zero amounts)
  if (!amountToTrade && amountToTrade !== 0) { // amount can be 0 for some order types or scenarios, but typically not for market/limit buys/sells.
      console.error(\`[OrderExecutor] Trade amount not available or invalid for \${signalData.symbol}.\`);
      StrategyConfigService.updateStrategyStatus(signalData.strategyConfigId, 'error', \`Order amount invalid for \${signalData.signal} \${signalData.symbol}\`).catch(e => {});
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
    // TODO:LOGGING: Structured log for successful order placement.
    // TODO:METRICS: Increment orders_placed_total metric (labels: exchange, symbol, side, type).
    StrategyConfigService.updateStrategyStatus(signalData.strategyConfigId, 'running', \`Order \${placedOrder.id} placed: \${signalData.signal} \${amountToTrade} \${signalData.symbol}\`).catch(e => {});

  } catch (error: any) {
    // TODO:LOGGING: Structured log for order placement failure, include error details and signalData.
    // TODO:METRICS: Increment order_placement_failures_total metric (labels: exchange, symbol, reason).
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

      // --- 6. Send Trade Notification ---
      if (placedOrder) {
        const user = await User.findById(signalData.userId).select('email username');
        if (user) {
          NotificationService.sendTradeNotification(user, placedOrder).catch(err => {
            console.error(\`[OrderExecutor] Failed to send trade notification for order \${placedOrder?.id}:\`, err);
          });
        } else {
          console.warn(\`[OrderExecutor] User \${signalData.userId} not found for sending trade notification.\`);
        }
      }

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
    // TODO:LOGGING: CRITICAL: Structured log for database logging failure post-order. This needs alerting.
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
