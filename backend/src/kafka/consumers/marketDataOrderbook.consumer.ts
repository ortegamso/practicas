import { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer } from '../index'; // Main Kafka consumer factory
import { query as pgQuery } from '../../database/timescaledb'; // TimescaleDB query function
import { getRedisClient, getOrderbookKey, isRedisConnected } from '../../redis';
import { OrderBook } from 'ccxt'; // Assuming CCXT OrderBook type

const GROUP_ID = 'marketdata-orderbook-persistor-group';
// This topic pattern will subscribe to all orderbook topics from any exchange/symbol
// e.g., marketdata.binance.btcusdt.orderbook, marketdata.bybit.ethusdt.orderbook
const TOPIC_PATTERN = /marketdata\..*\.orderbook/;

let consumer: Consumer | null = null;

const messageHandler = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  if (!message.value) {
    console.warn(\`[OrderbookConsumer] Received empty message from topic \${topic}\`);
    return;
  }

  try {
    const orderbook = JSON.parse(message.value.toString()) as OrderBook;

    // Extract exchange and symbol_id from topic or message content
    // Topic format: marketdata.{exchangeId}.{symbol_for_topic}.{type}
    const topicParts = topic.split('.');
    if (topicParts.length < 4) {
        console.error(\`[OrderbookConsumer] Invalid topic format: \${topic}\`);
        return;
    }
    const exchange = topicParts[1];
    // const symbolForTopic = topicParts[2]; // e.g., btcusdt
    // We need to map symbol string (e.g., BTC/USDT from orderbook.symbol) to our internal symbol_id
    // This requires a lookup, for now, let's assume orderbook.symbol exists and is what we need for lookup.

    if (!orderbook.symbol || !orderbook.timestamp || !orderbook.bids || !orderbook.asks) {
        console.warn('[OrderbookConsumer] Received malformed orderbook data:', orderbook);
        return;
    }

    // TODO: Get internal symbol_id from 'symbols' table based on orderbook.symbol and exchange
    // This is a placeholder. In a real system, you'd query your 'symbols' table.
    // For now, we'll log a warning and skip if symbol_id cannot be determined.
    // Example: const symbolResult = await pgQuery("SELECT id FROM symbols WHERE name = \$1 AND exchange = \$2", [orderbook.symbol, exchange]);
    // const symbolId = symbolResult.rows[0]?.id;
    // if (!symbolId) {
    //   console.warn(\`[OrderbookConsumer] Symbol ID not found for \${orderbook.symbol} on exchange \${exchange}. Skipping persistence.\`);
    //   return;
    // }
    const symbolIdPlaceholder = 1; // Replace with actual lookup

    const bidsJson = JSON.stringify(orderbook.bids);
    const asksJson = JSON.stringify(orderbook.asks);
    const time = new Date(orderbook.timestamp);

    const sql = \`
      INSERT INTO order_books_futures (time, symbol_id, exchange, bids, asks)
      VALUES (\$1, \$2, \$3, \$4, \$5)
      ON CONFLICT (time, symbol_id, exchange) DO UPDATE SET -- Upsert logic if needed, or just insert
        bids = EXCLUDED.bids,
        asks = EXCLUDED.asks;
    \`;
    // Using symbolIdPlaceholder for now
    // TODO:METRICS: Increment kafka_messages_processed_total (labels: topic, consumer_group).
    // TODO:METRICS: Record database insertion time (histogram: db_insertion_duration_seconds).
    await pgQuery(sql, [time, symbolIdPlaceholder, exchange, bidsJson, asksJson]);
    // console.log(\`[OrderbookConsumer] Persisted orderbook for \${orderbook.symbol} from \${exchange} at \${time.toISOString()}\`);
    if (isRedisConnected()) {
      const redisKey = getOrderbookKey(exchange, orderbook.symbol);
      const redisClient = getRedisClient();
      try {
        await redisClient.multi()
          .hSet(redisKey, 'bids', bidsJson)
          .hSet(redisKey, 'asks', asksJson)
          .hSet(redisKey, 'timestamp', orderbook.timestamp.toString())
          .hSet(redisKey, 'symbol', orderbook.symbol)
          .expire(redisKey, 300) // Cache for 5 minutes, adjust as needed
          .exec();
        // console.log(\`[OrderbookConsumer] Cached orderbook for \${orderbook.symbol} to Redis key \${redisKey}\`);
      } catch (redisErr) {
        console.error(\`[OrderbookConsumer] Failed to cache orderbook to Redis for \${orderbook.symbol}:\`, redisErr);
      }
    }

  } catch (error: any) {
    // TODO:LOGGING: Structured log for Kafka message processing error. Include topic, partition, offset, error.
    // TODO:METRICS: Increment kafka_consumer_errors_total metric (labels: topic, consumer_group).
    console.error(\`[OrderbookConsumer] Error processing message from topic \${topic}:\`, error.message);
    // Potentially send to a dead-letter queue (DLQ) or implement other error handling
  }
};

export const startOrderbookConsumer = async (): Promise<void> => {
  if (consumer) {
    console.log('[OrderbookConsumer] Already running.');
    return;
  }
  try {
    consumer = createConsumer(GROUP_ID);
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC_PATTERN, fromBeginning: false }); // Or fromBeginning: true if needed

    console.log(\`[OrderbookConsumer] Subscribed to topic pattern: \${TOPIC_PATTERN}\`);

    await consumer.run({
      eachMessage: messageHandler,
      // autoCommit: true, // Default is true
      // autoCommitInterval: 5000, // Default is 5000ms
    });
    console.log('[OrderbookConsumer] Consumer started and running.');
  } catch (error) {
    console.error('[OrderbookConsumer] Failed to start:', error);
    consumer = null; // Reset consumer if startup failed
  }
};

export const stopOrderbookConsumer = async (): Promise<void> => {
  if (consumer) {
    try {
      await consumer.disconnect();
      console.log('[OrderbookConsumer] Disconnected.');
    } catch (error) {
      console.error('[OrderbookConsumer] Failed to disconnect:', error);
    } finally {
      consumer = null;
    }
  } else {
    console.log('[OrderbookConsumer] Was not running.');
  }
};
