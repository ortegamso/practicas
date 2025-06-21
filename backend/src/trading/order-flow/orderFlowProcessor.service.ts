import { Consumer, Producer, EachMessagePayload } from 'kafkajs';
import { createConsumer, getProducer } from '../../kafka'; // Main Kafka factories
import { query as pgQuery } from '../../database/timescaledb';
import { getRedisClient, getOrderbookKey, isRedisConnected } from '../../redis';
import { Trade, OrderBook as CcxtOrderBook } from 'ccxt'; // CCXT Trade type
import { IFootprintCandle, IFootprintLevel, RawTradeData } from './orderFlow.model'; // Our defined interfaces
import { AppError, HttpCode } from '../../utils/appError'; // If needed for error handling within service

const KAFKA_CONSUMER_GROUP_ID = 'orderflow-processor-group';
// Subscribe to all trades_futures topics. Assumes topics like 'trades_futures.binance.btcusdt'
// If trades_futures is a single topic with exchange/symbol in message, adjust subscription.
// For now, assuming a wildcard/pattern if trades are separated by topic per instrument.
// If trades_futures is ONE topic, then: const KAFKA_TRADES_TOPIC = 'trades_futures';
const KAFKA_TRADES_TOPIC_PATTERN = /trades_futures\..*/; // Example: trades_futures.binance.btcusdt etc.
                                                       // Or just 'trades_futures' if it's a single topic.

const DEFAULT_FOOTPRINT_INTERVAL_MS = 60 * 1000; // 1 minute
const DEFAULT_PRICE_BUCKET_SIZE = 0.5; // Example: For BTC/USDT, group prices by $0.50 buckets. This needs to be symbol-specific.

// In-memory aggregation buffer. Key: \`\${exchange}:\${symbol}:\${intervalStartTime}\`
interface AggregationBuffer {
  startTime: number;
  endTime: number;
  exchange: string;
  symbol: string;
  trades: RawTradeData[]; // Trades collected within this interval for this symbol
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  totalVolume: number;
  // For footprint data per price level
  priceLevelData: Map<number, { bidVolume: number; askVolume: number; totalVolume: number }>;
}
const aggregationBuffers: Map<string, AggregationBuffer> = new Map();


class OrderFlowProcessorService {
  private consumer: Consumer | null = null;
  private producer: Producer;
  private processingIntervalHandle?: NodeJS.Timeout;

  constructor() {
    // Ensure Kafka producer is initialized (it's a singleton)
    this.producer = getProducer();
  }

  private getPriceBucket(price: number, bucketSize: number): number {
    // Snaps price to the floor of the bucket. E.g., 20000.3 with bucket 0.5 -> 20000.0
    // E.g., 20000.6 with bucket 0.5 -> 20000.5
    return Math.floor(price / bucketSize) * bucketSize;
  }

  private determineAggressorSide = async (trade: Trade, exchange: string): Promise<'buy' | 'sell' | 'unknown'> => {
    // TODO: More robust aggressor side determination.
    // This is a simplified placeholder.
    // It requires fetching the order book state from Redis around the time of the trade.
    // This can be complex due to timing, Redis latency, and order book snapshot granularity.

    if (trade.side) { // If CCXT trade object already has aggressor side (some exchanges might provide it)
        // 'buy' normally means taker bought (hit ask), 'sell' means taker sold (hit bid)
        // For footprint: aggressive buy -> askVolume, aggressive sell -> bidVolume
        return trade.side as 'buy' | 'sell';
    }

    if (!isRedisConnected()) {
        console.warn(\`[OFPS] Redis not connected, cannot determine aggressor side for trade \${trade.id}\`);
        return 'unknown';
    }
    const redisClient = getRedisClient();
    const orderbookKey = getOrderbookKey(exchange, trade.symbol);

    try {
        const obData = await redisClient.hGetAll(orderbookKey);
        if (obData && obData.bids && obData.asks) {
            const bids: [number, number][] = JSON.parse(obData.bids);
            const asks: [number, number][] = JSON.parse(obData.asks);

            if (bids.length > 0 && asks.length > 0) {
                const bestBid = bids[0][0];
                const bestAsk = asks[0][0];
                // Simple logic: if trade price is at or above best ask, it's likely an aggressive buy.
                // If trade price is at or below best bid, it's likely an aggressive sell.
                // If between, it's harder to tell without more info (e.g. maker/taker flag from exchange)
                if (trade.price >= bestAsk) return 'buy'; // Buyer hit the ask
                if (trade.price <= bestBid) return 'sell'; // Seller hit the bid
            }
        }
    } catch (err) {
        console.error(\`[OFPS] Error fetching order book from Redis for aggressor check (\${trade.symbol}):\`, err);
    }
    return 'unknown'; // Default if cannot determine
  };


  private async messageHandler({ topic, partition, message }: EachMessagePayload): Promise<void> {
    if (!message.value) {
      console.warn(\`[OFPS] Received empty trade message from topic \${topic}\`);
      return;
    }

    try {
      const trade = JSON.parse(message.value.toString()) as Trade; // Assuming CCXT Trade structure

      // Extract exchange & symbol from topic (e.g., trades_futures.binance.btcusdt)
      // Or from message if topic is generic 'trades_futures'
      const topicParts = topic.split('.');
      const exchange = topicParts.length > 1 ? topicParts[1] : trade.info?.exchange || 'unknown_exchange';
      const symbol = trade.symbol; // CCXT trade object should have .symbol

      if (!symbol || !exchange || !trade.timestamp || !trade.price || !trade.amount) {
        console.warn('[OFPS] Received malformed trade data, missing essential fields:', trade);
        return;
      }

      const intervalStartTime = Math.floor(trade.timestamp / DEFAULT_FOOTPRINT_INTERVAL_MS) * DEFAULT_FOOTPRINT_INTERVAL_MS;
      const bufferKey = \`\${exchange}:\${symbol}:\${intervalStartTime}\`;

      if (!aggregationBuffers.has(bufferKey)) {
        aggregationBuffers.set(bufferKey, {
          startTime: intervalStartTime,
          endTime: intervalStartTime + DEFAULT_FOOTPRINT_INTERVAL_MS -1, // -1ms to avoid overlap with next bar start
          exchange,
          symbol,
          trades: [],
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          totalVolume: 0,
          priceLevelData: new Map(),
        });
      }

      const buffer = aggregationBuffers.get(bufferKey)!;

      const aggressorSide = await this.determineAggressorSide(trade, exchange);
      if (aggressorSide === 'unknown' && trade.side) { // Fallback to trade.side if known
          // This mapping depends on how ccxt reports `trade.side` vs aggressor
          // Typically, if trade.side is 'buy', it means someone bought (aggressor or not).
          // For footprint, we care about TAKER actions.
          // Let's assume for now if `determineAggressorSide` is 'unknown', we can't use this trade for bid/ask volume.
          // Or, if trade.makerOrTaker is available, use that.
      }

      buffer.trades.push({
          timestamp: trade.timestamp,
          price: trade.price,
          quantity: trade.amount,
          aggressorSide: aggressorSide, // This is what we need
          tradeId: trade.id
      });

      // Update OHLC etc.
      buffer.high = Math.max(buffer.high!, trade.price);
      buffer.low = Math.min(buffer.low!, trade.price);
      buffer.close = trade.price;
      buffer.totalVolume += trade.amount;

      // Aggregate into price buckets
      // TODO: Get BUCKET_SIZE dynamically based on symbol (e.g., from a config or symbol metadata table)
      const priceBucket = this.getPriceBucket(trade.price, DEFAULT_PRICE_BUCKET_SIZE);
      let levelData = buffer.priceLevelData.get(priceBucket);
      if (!levelData) {
        levelData = { bidVolume: 0, askVolume: 0, totalVolume: 0 };
        buffer.priceLevelData.set(priceBucket, levelData);
      }

      if (aggressorSide === 'buy') { // Aggressive buy -> Ask Volume
        levelData.askVolume += trade.amount;
      } else if (aggressorSide === 'sell') { // Aggressive sell -> Bid Volume
        levelData.bidVolume += trade.amount;
      }
      levelData.totalVolume += trade.amount;


    } catch (error: any) {
      console.error(\`[OFPS] Error processing trade message from topic \${topic}:\`, error.message, message.value?.toString());
    }
  }

  private async processAndClearBuffers(): Promise<void> {
    const now = Date.now();
    for (const [key, buffer] of aggregationBuffers.entries()) {
      if (now >= buffer.endTime + 1000) { // Process buffer if its time window has passed (+1s buffer)
        console.log(\`[OFPS] Processing buffer for \${key} at \${new Date(now).toISOString()}\`);

        const footprintLevels: IFootprintLevel[] = [];
        let totalBarDelta = 0;

        // Sort price levels for consistent output (optional, but good for readability/DB)
        const sortedPriceLevels = Array.from(buffer.priceLevelData.keys()).sort((a, b) => a - b);

        for (const price of sortedPriceLevels) {
          const levelData = buffer.priceLevelData.get(price)!;
          const delta = levelData.askVolume - levelData.bidVolume;
          totalBarDelta += delta;
          footprintLevels.push({
            price: price,
            bidVolume: levelData.bidVolume,
            askVolume: levelData.askVolume,
            delta: delta,
            totalVolumeAtPrice: levelData.totalVolume,
            // TODO: Imbalance flag calculation
            imbalanceFlag: null,
          });
        }

        // TODO: Calculate POC, Value Area High/Low from footprintLevels
        const pocPrice = null; // Placeholder
        const vaHigh = null;   // Placeholder
        const vaLow = null;    // Placeholder

        const footprintCandle: IFootprintCandle = {
          symbol: buffer.symbol,
          exchange: buffer.exchange,
          intervalType: \`\${DEFAULT_FOOTPRINT_INTERVAL_MS / 1000}s\`, // e.g., '60s'
          startTime: new Date(buffer.startTime),
          endTime: new Date(buffer.endTime),
          openPrice: buffer.open,
          highPrice: buffer.high,
          lowPrice: buffer.low,
          closePrice: buffer.close,
          totalVolume: buffer.totalVolume,
          totalDelta: totalBarDelta,
          pocPrice: pocPrice,
          valueAreaHigh: vaHigh,
          valueAreaLow: vaLow,
          footprintData: footprintLevels,
        };

        // 1. Persist to TimescaleDB
        try {
          // TODO: Get internal symbol_id for buffer.symbol and buffer.exchange
          const symbolIdPlaceholder = 1; // Replace with actual lookup
          const sql = \`
            INSERT INTO footprints_futures
              (symbol_id, exchange, interval_type, start_time, end_time, open_price, high_price, low_price, close_price, total_volume, total_delta, poc_price, value_area_high, value_area_low, footprint_data)
            VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11, \$12, \$13, \$14, \$15)
            ON CONFLICT (symbol_id, exchange, interval_type, start_time) DO UPDATE SET
                end_time = EXCLUDED.end_time, open_price = EXCLUDED.open_price, high_price = EXCLUDED.high_price, low_price = EXCLUDED.low_price, close_price = EXCLUDED.close_price,
                total_volume = EXCLUDED.total_volume, total_delta = EXCLUDED.total_delta, poc_price = EXCLUDED.poc_price,
                value_area_high = EXCLUDED.value_area_high, value_area_low = EXCLUDED.value_area_low, footprint_data = EXCLUDED.footprint_data;
          \`;
          await pgQuery(sql, [
            symbolIdPlaceholder, footprintCandle.exchange, footprintCandle.intervalType, footprintCandle.startTime, footprintCandle.endTime,
            footprintCandle.openPrice, footprintCandle.highPrice, footprintCandle.lowPrice, footprintCandle.closePrice,
            footprintCandle.totalVolume, footprintCandle.totalDelta, footprintCandle.pocPrice, footprintCandle.valueAreaHigh, footprintCandle.valueAreaLow,
            JSON.stringify(footprintCandle.footprintData)
          ]);
          console.log(\`[OFPS] Persisted footprint for \${key} to TimescaleDB.\`);
        } catch (dbError) {
          console.error(\`[OFPS] Error persisting footprint for \${key} to TimescaleDB:\`, dbError);
        }

        // 2. Produce to Kafka topic for real-time consumers (e.g., API gateway for WebSockets)
        try {
            const processedTopic = \`footprints.processed.\${buffer.exchange.toLowerCase()}.\${buffer.symbol.replace('/', '').toLowerCase()}.\${footprintCandle.intervalType}\`;
            await this.producer.send({
                topic: processedTopic,
                messages: [{ key: buffer.symbol, value: JSON.stringify(footprintCandle) }]
            });
            console.log(\`[OFPS] Produced processed footprint for \${key} to Kafka topic \${processedTopic}.\`);
        } catch (kafkaError) {
            console.error(\`[OFPS] Error producing processed footprint for \${key} to Kafka:\`, kafkaError);
        }

        // 3. Cache in Redis (e.g., latest N footprints per symbol/interval)
        // TODO: Implement Redis caching for recent footprints

        aggregationBuffers.delete(key); // Clear buffer after processing
      }
    }
  }


  public async start(): Promise<void> {
    if (this.consumer) {
      console.log('[OFPS] Order Flow Processor Service already running.');
      return;
    }
    try {
      // Assuming KAFKA_TRADES_TOPIC_PATTERN is defined if consuming from multiple topics,
      // or KAFKA_TRADES_TOPIC if a single topic.
      // For this example, let's assume a single generic topic 'trades_futures' for all trades
      // and the message content itself contains exchange and symbol.
      const KAFKA_TRADES_TOPIC = 'trades_futures'; // Adjust if your topic structure is different

      this.consumer = createConsumer(KAFKA_CONSUMER_GROUP_ID);
      await this.consumer.connect();
      // await this.consumer.subscribe({ topic: KAFKA_TRADES_TOPIC_PATTERN, fromBeginning: false });
      await this.consumer.subscribe({ topic: KAFKA_TRADES_TOPIC, fromBeginning: false });

      console.log(\`[OFPS] Subscribed to topic: \${KAFKA_TRADES_TOPIC}\`);

      await this.consumer.run({
        eachMessage: (payload) => this.messageHandler(payload), // Bind 'this' context
      });
      console.log('[OFPS] Kafka consumer started and processing trades for order flow.');

      // Start interval for processing completed buffers
      this.processingIntervalHandle = setInterval(
        () => this.processAndClearBuffers(),
        DEFAULT_FOOTPRINT_INTERVAL_MS / 4 // Process buffers more frequently than they complete
      );

    } catch (error) {
      console.error('[OFPS] Failed to start Order Flow Processor Service:', error);
      this.consumer = null;
    }
  }

  public async stop(): Promise<void> {
    if (this.processingIntervalHandle) {
        clearInterval(this.processingIntervalHandle);
        this.processingIntervalHandle = undefined;
    }
    if (this.consumer) {
      try {
        await this.consumer.disconnect();
        console.log('[OFPS] Kafka consumer disconnected.');
      } catch (error) {
        console.error('[OFPS] Failed to disconnect Kafka consumer:', error);
      } finally {
        this.consumer = null;
      }
    }
    // Process any remaining buffers before fully stopping
    await this.processAndClearBuffers();
    console.log('[OFPS] Order Flow Processor Service stopped.');
    // Kafka producer is managed globally.
  }
}

const orderFlowProcessorService = new OrderFlowProcessorService();

// Export start/stop for server lifecycle integration
export const startOrderFlowProcessor = async () => {
  await orderFlowProcessorService.start();
};
export const stopOrderFlowProcessor = async () => {
  await orderFlowProcessorService.stop();
};

export default orderFlowProcessorService;

console.log('OrderFlowProcessorService loaded.');
