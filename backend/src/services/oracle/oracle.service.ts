import { getRedisClient, getOrderbookKey, isRedisConnected } from '../../redis';
import { getProducer } from '../../kafka';
import { Producer } from 'kafkajs';
import { OrderBook } from 'ccxt'; // For typing

// Define the structure for an oracle insight/signal
interface OracleInsight {
  timestamp: string;
  exchange: string;
  symbol: string;
  type: 'orderbook_imbalance' | 'liquidity_concentration'; // Example types
  data: any; // Specific data for the insight type
  confidence?: number; // Optional confidence score (0-1)
  message?: string; // Human-readable message
}

const KAFKA_MARKET_INSIGHTS_TOPIC = 'market.insights'; // Topic for oracle output
// const KAFKA_TRADING_SIGNALS_TOPIC = 'trading.signals'; // Or publish directly to signals if actionable

// Configuration for which markets the oracle should monitor
// This would typically be more dynamic, e.g., from a DB or config file
const MONITORED_MARKETS = [
  { exchange: 'binance', symbol: 'BTC/USDT' },
  { exchange: 'binance', symbol: 'ETH/USDT' },
  // { exchange: 'bybit', symbol: 'BTC/USDT' }, // Add more as needed
];

const ORACLE_EVALUATION_INTERVAL_MS = 30 * 1000; // Evaluate every 30 seconds

class OracleProcessorService {
  private producer: Producer;
  private isOracleRunning: boolean = false;
  private evaluationIntervalHandle?: NodeJS.Timeout;

  constructor() {
    this.producer = getProducer();
    // ensureTopicsExist([{ topic: KAFKA_MARKET_INSIGHTS_TOPIC }]); // Optional
  }

  public async start(): Promise<void> {
    if (this.isOracleRunning) {
      console.log('[OracleProcessor] Already running.');
      return;
    }
    this.isOracleRunning = true;
    console.log('[OracleProcessor] Starting...');

    this.evaluationIntervalHandle = setInterval(
      () => this.evaluateMonitoredMarkets(),
      ORACLE_EVALUATION_INTERVAL_MS
    );
    // Perform an initial evaluation immediately
    this.evaluateMonitoredMarkets();
    console.log('[OracleProcessor] Started and monitoring configured markets.');
  }

  public async stop(): Promise<void> {
    if (!this.isOracleRunning) {
      console.log('[OracleProcessor] Already stopped.');
      return;
    }
    this.isOracleRunning = false;
    if (this.evaluationIntervalHandle) {
      clearInterval(this.evaluationIntervalHandle);
      this.evaluationIntervalHandle = undefined;
    }
    console.log('[OracleProcessor] Stopped.');
    // Kafka producer is managed globally
  }

  private async evaluateMonitoredMarkets(): Promise<void> {
    if (!this.isOracleRunning) return;
    console.log('[OracleProcessor] Evaluating monitored markets...');

    if (!isRedisConnected()) {
      console.warn('[OracleProcessor] Redis not connected. Skipping evaluation cycle.');
      return;
    }
    const redisClient = getRedisClient();

    for (const market of MONITORED_MARKETS) {
      try {
        const orderbookKey = getOrderbookKey(market.exchange, market.symbol);
        const orderbookDataStringMap = await redisClient.hGetAll(orderbookKey);

        if (!orderbookDataStringMap || !orderbookDataStringMap.bids || !orderbookDataStringMap.asks) {
          // console.warn(\`[OracleProcessor] No order book data in Redis for \${market.exchange} \${market.symbol}\`);
          continue;
        }

        const orderbook: Partial<OrderBook> & { bids?: [number, number][], asks?: [number, number][] } = {
            symbol: orderbookDataStringMap.symbol,
            timestamp: parseInt(orderbookDataStringMap.timestamp, 10),
            bids: JSON.parse(orderbookDataStringMap.bids),
            asks: JSON.parse(orderbookDataStringMap.asks),
        };

        if (!orderbook.bids || !orderbook.asks || orderbook.bids.length === 0 || orderbook.asks.length === 0) {
            console.warn(\`[OracleProcessor] Incomplete order book data for \${market.exchange} \${market.symbol}\`);
            continue;
        }

        // --- Simple Order Book Imbalance Calculation ---
        // Consider top N levels or a certain depth in price
        const depthToConsider = Math.min(10, orderbook.bids.length, orderbook.asks.length); // e.g., top 10 levels
        let totalBidVolume = 0;
        for (let i = 0; i < depthToConsider; i++) {
          totalBidVolume += orderbook.bids[i][1]; // Summing quantities
        }
        let totalAskVolume = 0;
        for (let i = 0; i < depthToConsider; i++) {
          totalAskVolume += orderbook.asks[i][1]; // Summing quantities
        }

        const imbalanceRatio = totalBidVolume / (totalBidVolume + totalAskVolume); // Ratio of bids to total volume in top levels

        let imbalanceMessage = \`Order book imbalance for \${market.symbol} on \${market.exchange}: Ratio \${imbalanceRatio.toFixed(3)}.\`;
        let confidence = Math.abs(imbalanceRatio - 0.5) * 2; // Simple confidence: 0 if balanced, 1 if fully skewed

        if (imbalanceRatio > 0.65) { // Significantly more bid volume
          imbalanceMessage += " Strong buy pressure indicated.";
        } else if (imbalanceRatio < 0.35) { // Significantly more ask volume
          imbalanceMessage += " Strong sell pressure indicated.";
        } else {
          imbalanceMessage += " Relatively balanced.";
        }

        const insight: OracleInsight = {
          timestamp: new Date().toISOString(),
          exchange: market.exchange,
          symbol: market.symbol,
          type: 'orderbook_imbalance',
          data: {
            totalBidVolumeInDepth: totalBidVolume,
            totalAskVolumeInDepth: totalAskVolume,
            imbalanceRatio: imbalanceRatio,
            depthConsidered: depthToConsider,
            bestBid: orderbook.bids[0],
            bestAsk: orderbook.asks[0],
          },
          confidence: parseFloat(confidence.toFixed(3)),
          message: imbalanceMessage,
        };

        // console.log(\`[OracleProcessor] \${imbalanceMessage}\`);

        // Publish insight to Kafka
        await this.producer.send({
          topic: KAFKA_MARKET_INSIGHTS_TOPIC,
          messages: [{ key: market.symbol, value: JSON.stringify(insight) }],
        });

      } catch (error: any) {
        console.error(\`[OracleProcessor] Error evaluating market \${market.exchange} \${market.symbol}:\`, error.message);
        // Continue to next market
      }
    }
  }
}

const oracleProcessorService = new OracleProcessorService();

export const startOracleProcessor = async () => {
  await oracleProcessorService.start();
};
export const stopOracleProcessor = async () => {
  await oracleProcessorService.stop();
};

export default oracleProcessorService;
