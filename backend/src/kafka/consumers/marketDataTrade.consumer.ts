import { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer } from '../index';
import { query as pgQuery } from '../../database/timescaledb';
import { getRedisClient, getTradesKey, isRedisConnected } from '../../redis';
import { Trade } from 'ccxt';

const GROUP_ID = 'marketdata-trade-persistor-group';
const TOPIC_PATTERN = /marketdata\..*\.trades/;

let consumer: Consumer | null = null;

const messageHandler = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  if (!message.value) {
    console.warn(\`[TradeConsumer] Received empty message from topic \${topic}\`);
    return;
  }
  try {
    const trade = JSON.parse(message.value.toString()) as Trade;

    const topicParts = topic.split('.');
    if (topicParts.length < 4) {
        console.error(\`[TradeConsumer] Invalid topic format: \${topic}\`);
        return;
    }
    const exchange = topicParts[1];

    if (!trade.symbol || !trade.timestamp || !trade.price || !trade.amount || !trade.side) {
        console.warn('[TradeConsumer] Received malformed trade data:', trade);
        return;
    }

    // TODO: Get internal symbol_id from 'symbols' table based on trade.symbol and exchange
    const symbolIdPlaceholder = 1; // Replace with actual lookup

    const time = new Date(trade.timestamp);

    const sql = \`
      INSERT INTO trades_futures (time, symbol_id, exchange, trade_id, price, quantity, side, is_maker)
      VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8)
      ON CONFLICT (time, symbol_id, exchange, trade_id) DO NOTHING; -- Assuming trade_id makes it unique with time context
    \`;
    await pgQuery(sql, [time, symbolIdPlaceholder, exchange, trade.id, trade.price, trade.amount, trade.side, trade.makerOrTaker === 'maker']);
    // console.log(\`[TradeConsumer] Persisted trade for \${trade.symbol} from \${exchange}\`);
    if (isRedisConnected()) {
      const redisKey = getTradesKey(exchange, trade.symbol);
      const redisClient = getRedisClient();
      const MAX_TRADES_IN_CACHE = 100; // Keep last 100 trades
      try {
        await redisClient.multi()
          .lPush(redisKey, JSON.stringify(trade))
          .lTrim(redisKey, 0, MAX_TRADES_IN_CACHE - 1)
          .expire(redisKey, 3600) // Cache list for 1 hour
          .exec();
        // console.log(\`[TradeConsumer] Cached trade for \${trade.symbol} to Redis key \${redisKey}\`);
      } catch (redisErr) {
        console.error(\`[TradeConsumer] Failed to cache trade to Redis for \${trade.symbol}:\`, redisErr);
      }
    }

  } catch (error: any) {
    console.error(\`[TradeConsumer] Error processing message from topic \${topic}:\`, error.message);
  }
};

export const startTradeConsumer = async (): Promise<void> => {
  if (consumer) {
    console.log('[TradeConsumer] Already running.');
    return;
  }
  try {
    consumer = createConsumer(GROUP_ID);
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC_PATTERN, fromBeginning: false });
    console.log(\`[TradeConsumer] Subscribed to topic pattern: \${TOPIC_PATTERN}\`);
    await consumer.run({ eachMessage: messageHandler });
    console.log('[TradeConsumer] Consumer started and running.');
  } catch (error) {
    console.error('[TradeConsumer] Failed to start:', error);
    consumer = null;
  }
};

export const stopTradeConsumer = async (): Promise<void> => {
  if (consumer) {
    try {
      await consumer.disconnect();
      console.log('[TradeConsumer] Disconnected.');
    } catch (error) {
      console.error('[TradeConsumer] Failed to disconnect:', error);
    } finally {
      consumer = null;
    }
  }
};
