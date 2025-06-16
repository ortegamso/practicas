import { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer } from '../index';
import { query as pgQuery } from '../../database/timescaledb';
import { getRedisClient, getTickerKey, isRedisConnected } from '../../redis';
import { Ticker } from 'ccxt';

const GROUP_ID = 'marketdata-ticker-persistor-group';
const TOPIC_PATTERN = /marketdata\..*\.ticker/;

let consumer: Consumer | null = null;

const messageHandler = async ({ topic, partition, message }: EachMessagePayload): Promise<void> => {
  if (!message.value) {
    console.warn(\`[TickerConsumer] Received empty message from topic \${topic}\`);
    return;
  }
  try {
    const ticker = JSON.parse(message.value.toString()) as Ticker;

    const topicParts = topic.split('.');
     if (topicParts.length < 4) {
        console.error(\`[TickerConsumer] Invalid topic format: \${topic}\`);
        return;
    }
    const exchange = topicParts[1];

    if (!ticker.symbol || !ticker.timestamp || ticker.last === undefined || ticker.open === undefined || ticker.high === undefined || ticker.low === undefined) {
        console.warn('[TickerConsumer] Received malformed ticker data (missing key fields):', ticker);
        return;
    }

    // TODO: Get internal symbol_id from 'symbols' table based on ticker.symbol and exchange
    const symbolIdPlaceholder = 1; // Replace with actual lookup

    const time = new Date(ticker.timestamp);

    const sql = \`
      INSERT INTO mini_tickers_futures (time, symbol_id, exchange, open, high, low, close, volume, quote_volume)
      VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9)
      ON CONFLICT (time, symbol_id, exchange) DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        quote_volume = EXCLUDED.quote_volume;
    \`;
    await pgQuery(sql, [time, symbolIdPlaceholder, exchange, ticker.open, ticker.high, ticker.low, ticker.last, ticker.baseVolume, ticker.quoteVolume]);
    // console.log(\`[TickerConsumer] Persisted ticker for \${ticker.symbol} from \${exchange}\`);
    if (isRedisConnected()) {
      const redisKey = getTickerKey(exchange, ticker.symbol);
      const redisClient = getRedisClient();
      try {
        await redisClient.hSet(redisKey, {
            symbol: ticker.symbol,
            timestamp: ticker.timestamp.toString(),
            datetime: ticker.datetime,
            high: ticker.high.toString(),
            low: ticker.low.toString(),
            bid: ticker.bid?.toString() || '',
            bidVolume: ticker.bidVolume?.toString() || '',
            ask: ticker.ask?.toString() || '',
            askVolume: ticker.askVolume?.toString() || '',
            vwap: ticker.vwap?.toString() || '',
            open: ticker.open.toString(),
            close: ticker.close.toString(), // same as last
            last: ticker.last.toString(),
            previousClose: ticker.previousClose?.toString() || '',
            change: ticker.change?.toString() || '',
            percentage: ticker.percentage?.toString() || '',
            average: ticker.average?.toString() || '',
            baseVolume: ticker.baseVolume?.toString() || '',
            quoteVolume: ticker.quoteVolume?.toString() || '',
        });
        await redisClient.expire(redisKey, 300); // Cache for 5 minutes
        // console.log(\`[TickerConsumer] Cached ticker for \${ticker.symbol} to Redis key \${redisKey}\`);
      } catch (redisErr) {
        console.error(\`[TickerConsumer] Failed to cache ticker to Redis for \${ticker.symbol}:\`, redisErr);
      }
    }

  } catch (error: any) {
    console.error(\`[TickerConsumer] Error processing message from topic \${topic}:\`, error.message);
  }
};

export const startTickerConsumer = async (): Promise<void> => {
  if (consumer) {
    console.log('[TickerConsumer] Already running.');
    return;
  }
  try {
    consumer = createConsumer(GROUP_ID);
    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC_PATTERN, fromBeginning: false });
    console.log(\`[TickerConsumer] Subscribed to topic pattern: \${TOPIC_PATTERN}\`);
    await consumer.run({ eachMessage: messageHandler });
    console.log('[TickerConsumer] Consumer started and running.');
  } catch (error) {
    console.error('[TickerConsumer] Failed to start:', error);
    consumer = null;
  }
};

export const stopTickerConsumer = async (): Promise<void> => {
  if (consumer) {
    try {
      await consumer.disconnect();
      console.log('[TickerConsumer] Disconnected.');
    } catch (error) {
      console.error('[TickerConsumer] Failed to disconnect:', error);
    } finally {
      consumer = null;
    }
  }
};
