import ccxtPro from 'ccxt.pro'; // Use ccxt.pro for WebSocket support
import { Exchange, OrderBook, Trade, Ticker } from 'ccxt';
import { getProducer, ensureTopicsExist } from '../../kafka'; // Assuming getProducer is from your kafka/index.ts
import { Producer } from 'kafkajs';
import config from '../../config'; // For any specific feed configurations

// Define types for the data we're watching
type WatchedSymbolType = 'orderbook' | 'trades' | 'ticker';
interface WatchedSymbol {
  exchangeId: string; // e.g., 'binance', 'bybit'
  symbol: string; // e.g., 'BTC/USDT'
  type: WatchedSymbolType;
  ccxtProExchange?: Exchange; // ccxt.pro instance for this exchange
  isActive: boolean;
  lastError?: string;
  lastActivity?: Date;
}

// In-memory store for what we are watching
// In a larger system, this might come from a database or dynamic configuration
const watchedSymbolsRegistry: { [key: string]: WatchedSymbol } = {};

class MarketDataFeedService {
  private producer: Producer;
  private isRunning: boolean = false;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private readonly RECONNECT_DELAY_MS = 15000; // 15 seconds
  private readonly CONNECTION_CHECK_INTERVAL_MS = 60000; // 1 minute

  constructor() {
    this.producer = getProducer(); // Get the global Kafka producer
    // Ensure topics exist (example, can be more dynamic)
    // This is illustrative; topic creation might be better handled at deployment
    // or by an admin interface if dynamic topic creation is frequent.
    // For now, we assume topics are like: marketdata.{exchangeId}.{symbol_for_topic}.{type}
    // e.g., marketdata.binance.btcusdt.orderbook
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MarketDataFeedService] Already running.');
      return;
    }
    this.isRunning = true;
    console.log('[MarketDataFeedService] Starting...');

    // Initialize producer if not already connected (idempotent)
    // await connectProducer(); // Assuming connectProducer is exposed and handles already connected state

    // Example: Add symbols to watch (this would typically be dynamic)
    this.addSymbolToWatch({ exchangeId: 'binance', symbol: 'BTC/USDT', type: 'ticker', isActive: true });
    this.addSymbolToWatch({ exchangeId: 'binance', symbol: 'BTC/USDT', type: 'trades', isActive: true });
    this.addSymbolToWatch({ exchangeId: 'binance', symbol: 'BTC/USDT', type: 'orderbook', isActive: true });
    // this.addSymbolToWatch({ exchangeId: 'bybit', symbol: 'ETH/USDT', type: 'ticker', isActive: true });
    // this.addSymbolToWatch({ exchangeId: 'bybit', symbol: 'ETH/USDT', type: 'trades', isActive: true });
    // this.addSymbolToWatch({ exchangeId: 'bybit', symbol: 'ETH/USDT', type: 'orderbook', isActive: true });


    await this.initiateWatchLoops();

    // Start a periodic check for connections that might have died silently
    this.connectionCheckInterval = setInterval(
        () => this.checkAndRestartInactiveLoops(),
        this.CONNECTION_CHECK_INTERVAL_MS
    );

    console.log('[MarketDataFeedService] Started and watching configured symbols.');
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('[MarketDataFeedService] Already stopped.');
      return;
    }
    this.isRunning = false;
    console.log('[MarketDataFeedService] Stopping...');

    if (this.connectionCheckInterval) {
        clearInterval(this.connectionCheckInterval);
        this.connectionCheckInterval = null;
    }

    // Close all WebSocket connections
    for (const key in watchedSymbolsRegistry) {
      const entry = watchedSymbolsRegistry[key];
      if (entry.ccxtProExchange && entry.ccxtProExchange.close) {
        try {
          await entry.ccxtProExchange.close();
          console.log(\`[MarketDataFeedService] Closed WebSocket for \${entry.exchangeId} - \${entry.symbol} - \${entry.type}\`);
        } catch (e: any) {
          console.error(\`[MarketDataFeedService] Error closing WebSocket for \${entry.exchangeId} - \${entry.symbol} - \${entry.type}:\`, e.message);
        }
      }
      entry.isActive = false; // Mark as inactive
    }
    // Clear the registry if stopping means a full reset, or manage state elsewhere
    // Object.keys(watchedSymbolsRegistry).forEach(key => delete watchedSymbolsRegistry[key]);


    // Producer disconnect is handled globally by kafka/index.ts shutdownKafka
    console.log('[MarketDataFeedService] Stopped.');
  }

  public addSymbolToWatch(symbolConfig: Omit<WatchedSymbol, 'ccxtProExchange' | 'lastActivity'>): void {
    const key = \`\${symbolConfig.exchangeId}-\${symbolConfig.symbol}-\${symbolConfig.type}\`;
    if (watchedSymbolsRegistry[key]) {
      console.log(\`[MarketDataFeedService] Symbol \${key} is already being watched. Updating config.\`);
      watchedSymbolsRegistry[key] = { ...watchedSymbolsRegistry[key], ...symbolConfig, isActive: symbolConfig.isActive };
    } else {
      watchedSymbolsRegistry[key] = { ...symbolConfig, isActive: symbolConfig.isActive };
    }

    if (symbolConfig.isActive && this.isRunning) {
      // If service is running and a new active symbol is added, initiate its watch loop
      this.initiateWatchLoopForKey(key);
    } else if (!symbolConfig.isActive && watchedSymbolsRegistry[key]?.ccxtProExchange) {
        // If marked inactive, try to close its specific WS connection
        const entry = watchedSymbolsRegistry[key];
        if(entry.ccxtProExchange && entry.ccxtProExchange.close) {
            entry.ccxtProExchange.close().catch(e => console.error(\`Error closing WS for inactive \${key}\`, e));
            entry.ccxtProExchange = undefined; // Clear instance
        }
    }
  }

  private getKafkaTopicName(exchangeId: string, symbol: string, type: WatchedSymbolType): string {
    const sanitizedSymbol = symbol.replace('/', '').toLowerCase(); // BTC/USDT -> btcusdt
    return \`marketdata.\${exchangeId}.\${sanitizedSymbol}.\${type}\`;
  }

  private async initiateWatchLoops(): Promise<void[]> {
    const promises = [];
    for (const key in watchedSymbolsRegistry) {
      if (watchedSymbolsRegistry[key].isActive) {
        promises.push(this.initiateWatchLoopForKey(key));
      }
    }
    return Promise.all(promises);
  }

  private async checkAndRestartInactiveLoops(): Promise<void> {
    console.log("[MarketDataFeedService] Performing periodic check of WebSocket connections...");
    for (const key in watchedSymbolsRegistry) {
        const entry = watchedSymbolsRegistry[key];
        if (entry.isActive && !entry.ccxtProExchange) { // If it's supposed to be active but has no instance (e.g. failed previously)
            console.warn(\`[MarketDataFeedService] \${key} is active but has no WS instance. Attempting to restart loop.\`);
            this.initiateWatchLoopForKey(key).catch(e => {
                console.error(\`[MarketDataFeedService] Error restarting loop for \${key} during check:\`, e.message);
                entry.lastError = e.message;
            });
        } else if (entry.isActive && entry.ccxtProExchange && entry.lastActivity) {
            // Check for staleness if exchange provides a way or ccxt.pro has connection status
            // For now, this is a simple restart if it was marked as having no instance
            // More advanced: check entry.ccxtProExchange.clients[some_url].readyState or similar, if available
            const timeSinceLastActivity = Date.now() - entry.lastActivity.getTime();
            if (timeSinceLastActivity > (this.CONNECTION_CHECK_INTERVAL_MS * 2) ) { // Example: if no activity for 2 check intervals
                console.warn(\`[MarketDataFeedService] \${key} seems stale (last activity \${Math.round(timeSinceLastActivity/1000)}s ago). Attempting to restart.\`);
                if (entry.ccxtProExchange.close) await entry.ccxtProExchange.close().catch(e => console.error(\`Error closing stale WS for \${key}\`, e));
                entry.ccxtProExchange = undefined;
                this.initiateWatchLoopForKey(key).catch(e => {
                    console.error(\`[MarketDataFeedService] Error restarting stale loop for \${key}:\`, e.message);
                    entry.lastError = e.message;
                });
            }
        }
    }
}


  private async initiateWatchLoopForKey(key: string): Promise<void> {
    const entry = watchedSymbolsRegistry[key];
    if (!entry || !entry.isActive) return;

    // Avoid re-initializing if already has an instance (unless forced)
    if (entry.ccxtProExchange) {
        console.log(\`[MarketDataFeedService] Watch loop for \${key} seems to be already initialized.\`);
        // Could add a check here: if (!entry.ccxtProExchange.connected) then re-initiate.
        // However, ccxt.pro handles reconnections internally for many cases.
        return;
    }

    // TODO:LOGGING: Log when a new watch loop is initiated.
    // TODO:METRICS: Gauge for active_websocket_subscriptions (labels: exchange, symbol, type). Increment here.
    console.log(\`[MarketDataFeedService] Initializing watch loop for \${key}\`);
    entry.lastError = undefined; // Clear previous error

    try {
      const exchangeId = entry.exchangeId;
      if (!ccxtPro.hasOwnProperty(exchangeId)) {
        throw new Error(\`Exchange \${exchangeId} is not supported by ccxt.pro\`);
      }
      // One ccxt.pro instance per exchange, not per symbol/type for that exchange
      // So, we need to manage instances more globally if multiple symbols/types share an exchange.
      // For simplicity here, let's assume one ws connection per watched symbol entry which is not optimal.
      // A better approach: group by exchangeId, create one ccxt.pro instance, then make multiple watch calls on it.
      // This current simplified approach will create multiple WS connections to the same exchange if watching multiple things.

      // --- REVISED APPROACH: One instance per exchangeId ---
      // Find or create the ccxt.pro instance for this exchange
      let exchangeInstance = Object.values(watchedSymbolsRegistry)
                                   .find(e => e.exchangeId === exchangeId && e.ccxtProExchange)
                                   ?.ccxtProExchange;

      if (!exchangeInstance) {
          console.log(\`[MarketDataFeedService] Creating new ccxt.pro instance for \${exchangeId}\`);
          exchangeInstance = new (ccxtPro as any)[exchangeId]({
            // New specific ccxt.pro options if any, like 'verbose': config.nodeEnv === 'development'
            // API keys are usually not needed for public market data via WebSockets
          });
          // Store this instance on all entries for this exchangeId to reuse it
          Object.values(watchedSymbolsRegistry).forEach(e => {
              if (e.exchangeId === exchangeId) e.ccxtProExchange = exchangeInstance;
          });
      }
      entry.ccxtProExchange = exchangeInstance; // Ensure current entry has it.
      // --- END REVISED APPROACH ---


      const kafkaTopic = this.getKafkaTopicName(entry.exchangeId, entry.symbol, entry.type);
      // Ensure topic exists (optional, can be slow if called frequently)
      // await ensureTopicsExist([{ topic: kafkaTopic, numPartitions: 1, replicationFactor: 1 }]);

      console.log(\`[MarketDataFeedService] Watching \${entry.type} for \${entry.symbol} on \${entry.exchangeId} -> Kafka topic: \${kafkaTopic}\`);

      switch (entry.type) {
        case 'orderbook':
          // eslint-disable-next-line no-constant-condition
          while (this.isRunning && entry.isActive && entry.ccxtProExchange) {
            try {
              const orderbook: OrderBook = await entry.ccxtProExchange.watchOrderBook(entry.symbol);
              entry.lastActivity = new Date();
              await this.producer.send({
                topic: kafkaTopic,
                messages: [{ key: entry.symbol, value: JSON.stringify(orderbook) }],
              });
            } catch (e: any) {
              // TODO:LOGGING: Structured log for WebSocket watch error (orderbook, trades, ticker). Include exchange, symbol, error.
              // TODO:METRICS: Increment websocket_watch_errors_total metric (labels: exchange, symbol, type).
              console.error(\`[MarketDataFeedService] Error watching orderbook for \${key}:\`, e.message);
              entry.lastError = e.message;
              // Close this specific watch loop and mark for potential restart by checkAndRestartInactiveLoops
              if(entry.ccxtProExchange?.close) await entry.ccxtProExchange.close().catch(err => console.error("Error closing WS on orderbook error", err));
              entry.ccxtProExchange = undefined;
              if (this.isRunning && entry.isActive) await new Promise(resolve => setTimeout(resolve, this.RECONNECT_DELAY_MS)); else break;
            }
          }
          break;
        case 'trades':
          // eslint-disable-next-line no-constant-condition
          while (this.isRunning && entry.isActive && entry.ccxtProExchange) {
            try {
              const trades: Trade[] = await entry.ccxtProExchange.watchTrades(entry.symbol);
              entry.lastActivity = new Date();
              if (trades.length > 0) {
                const messages = trades.map(trade => ({
                  key: entry.symbol,
                  value: JSON.stringify(trade),
                }));
                await this.producer.send({ topic: kafkaTopic, messages });
              }
            } catch (e: any) {
              console.error(\`[MarketDataFeedService] Error watching trades for \${key}:\`, e.message);
              entry.lastError = e.message;
              if(entry.ccxtProExchange?.close) await entry.ccxtProExchange.close().catch(err => console.error("Error closing WS on trades error", err));
              entry.ccxtProExchange = undefined;
              if (this.isRunning && entry.isActive) await new Promise(resolve => setTimeout(resolve, this.RECONNECT_DELAY_MS)); else break;
            }
          }
          break;
        case 'ticker':
          // eslint-disable-next-line no-constant-condition
          while (this.isRunning && entry.isActive && entry.ccxtProExchange) {
            try {
              const ticker: Ticker = await entry.ccxtProExchange.watchTicker(entry.symbol);
              entry.lastActivity = new Date();
              await this.producer.send({
                topic: kafkaTopic,
                messages: [{ key: entry.symbol, value: JSON.stringify(ticker) }],
              });
            } catch (e: any) {
              console.error(\`[MarketDataFeedService] Error watching ticker for \${key}:\`, e.message);
              entry.lastError = e.message;
              if(entry.ccxtProExchange?.close) await entry.ccxtProExchange.close().catch(err => console.error("Error closing WS on ticker error", err));
              entry.ccxtProExchange = undefined;
              if (this.isRunning && entry.isActive) await new Promise(resolve => setTimeout(resolve, this.RECONNECT_DELAY_MS)); else break;
            }
          }
          break;
        default:
          console.warn(\`[MarketDataFeedService] Unknown watch type: \${entry.type} for \${key}\`);
          entry.isActive = false; // Stop trying for unknown type
      }
    } catch (e: any) {
      console.error(\`[MarketDataFeedService] Failed to initialize watch loop for \${key}:\`, e.message);
      entry.lastError = e.message;
      if (entry.ccxtProExchange && entry.ccxtProExchange.close) { // Clean up instance if created before error
        await entry.ccxtProExchange.close().catch(err => console.error("Error closing WS on init error", err));
      }
      entry.ccxtProExchange = undefined; // Mark for potential restart
      // No automatic retry here for init failure, checkAndRestartInactiveLoops will handle it.
    } finally {
        if (!entry.isActive || !this.isRunning) {
            // TODO:METRICS: Gauge for active_websocket_subscriptions. Decrement here.
            console.log(\`[MarketDataFeedService] Watch loop for \${key} terminated (\isActive: \${entry.isActive}, isRunning: \${this.isRunning}).\`);
            if (entry.ccxtProExchange && entry.ccxtProExchange.close) {
                await entry.ccxtProExchange.close().catch(e => console.error(\`Error closing WS for terminated loop \${key}\`,e));
                entry.ccxtProExchange = undefined;
            }
        }
    }
  }
}

const marketDataFeedService = new MarketDataFeedService();

// Export a way to start/stop the service, perhaps from server.ts or a dedicated cli
export const startMarketDataFeed = async () => {
  await marketDataFeedService.start();
};

export const stopMarketDataFeed = async () => {
  await marketDataFeedService.stop();
};

// For dynamic management (e.g. via API)
export const addMarketDataWatch = (config: Omit<WatchedSymbol, 'ccxtProExchange' | 'lastActivity'>) => {
    marketDataFeedService.addSymbolToWatch(config);
};
export const getWatchedSymbols = () => {
    return Object.values(watchedSymbolsRegistry).map(entry => ({
        exchangeId: entry.exchangeId,
        symbol: entry.symbol,
        type: entry.type,
        isActive: entry.isActive,
        lastError: entry.lastError,
        lastActivity: entry.lastActivity,
        hasInstance: !!entry.ccxtProExchange,
    }));
};


// Optional: Integrate with server lifecycle (if it's a singleton service to run always)
// This requires modifying server.ts to call startMarketDataFeed and stopMarketDataFeed.
// For now, it's exported to be manually started or controlled by another part of the application.

console.log('MarketDataFeedService loaded.');
