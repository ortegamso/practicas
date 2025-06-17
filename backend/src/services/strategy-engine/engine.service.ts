import StrategyConfigService from '../trading/strategyConfig.service';
import { IStrategyConfig } from '../../models/mongodb/strategyConfig.model';
import { getProducer } from '../../kafka'; // To send signals
import { Producer } from 'kafkajs';
import { getRedisClient, getOrderbookKey, getTickerKey, getTradesKey, isRedisConnected } from '../../redis'; // To fetch cached market data
import { OrderBook, Ticker, Trade } from 'ccxt'; // For typing cached data

// Define a simple structure for an active strategy instance managed by the engine
interface ActiveStrategyInstance {
  config: IStrategyConfig;
  isRunning: boolean; // Different from config.isActive (user's intent vs engine's current state)
  lastEvaluation?: Date;
  nextEvaluationTime?: Date; // For scheduling
  intervalHandle?: NodeJS.Timeout; // To manage its execution loop
  consecutiveErrors: number;
  // Add any state the strategy needs to maintain between evaluations, e.g., previous MA values
  // For simplicity, strategy-specific state can be a generic object for now
  strategyState: Record<string, any>;
}

const KAFKA_TRADING_SIGNALS_TOPIC = 'trading.signals';
const MAX_CONSECUTIVE_ERRORS = 5; // Max errors before auto-disabling a strategy instance
const DEFAULT_EVALUATION_INTERVAL_MS = 60 * 1000; // Default: 1 minute, should be configurable per strategy

class StrategyEngineService {
  private producer: Producer;
  private activeStrategies: Map<string, ActiveStrategyInstance> = new Map(); // Key: strategyConfig.id
  private isEngineRunning: boolean = false;
  private mainLoopInterval: NodeJS.Timeout | null = null;
  private readonly ENGINE_MAIN_LOOP_INTERVAL_MS = 10 * 1000; // How often engine checks for new/stopped strategies

  constructor() {
    this.producer = getProducer(); // Get the global Kafka producer
    // Ensure KAFKA_TRADING_SIGNALS_TOPIC exists (optional, can be handled by Kafka setup)
    // ensureTopicsExist([{ topic: KAFKA_TRADING_SIGNALS_TOPIC, numPartitions: 1, replicationFactor: 1 }]);
  }

  public async start(): Promise<void> {
    if (this.isEngineRunning) {
      console.log('[StrategyEngine] Already running.');
      return;
    }
    this.isEngineRunning = true;
    console.log('[StrategyEngine] Starting...');

    // Load initial active strategies
    await this.loadAndManageStrategies();

    // Start main loop to periodically check for new/updated strategies
    this.mainLoopInterval = setInterval(
      () => this.loadAndManageStrategies(),
      this.ENGINE_MAIN_LOOP_INTERVAL_MS
    );

    console.log('[StrategyEngine] Started and managing strategies.');
  }

  public async stop(): Promise<void> {
    if (!this.isEngineRunning) {
      console.log('[StrategyEngine] Already stopped.');
      return;
    }
    this.isEngineRunning = false;
    console.log('[StrategyEngine] Stopping...');

    if (this.mainLoopInterval) {
      clearInterval(this.mainLoopInterval);
      this.mainLoopInterval = null;
    }

    // Stop all individual strategy evaluation loops
    this.activeStrategies.forEach(instance => {
      if (instance.intervalHandle) {
        clearInterval(instance.intervalHandle);
      }
      instance.isRunning = false;
      // Update DB status for strategies that were running
      if (instance.config.status === 'running') {
        StrategyConfigService.updateStrategyStatus(instance.config.id, 'stopped', 'Engine shutdown').catch(e =>
            console.error(\`[StrategyEngine] Error updating status to stopped for \${instance.config.id} on shutdown:\`, e)
        );
      }
    });
    this.activeStrategies.clear();
    console.log('[StrategyEngine] All strategy instances stopped.');
    // Producer disconnect is handled globally
  }

  private async loadAndManageStrategies(): Promise<void> {
    if (!this.isEngineRunning) return;
    console.log('[StrategyEngine] Checking for active strategies to manage...');

    try {
      // Fetch all strategy configs that the user marked as active OR that are in 'pending_start' or 'running' state
      // This allows engine to pick up user changes and also manage its own lifecycle.
      const potentiallyRunnableConfigs = await StrategyConfigService.findAllStrategiesByStatusOrActivity(true, ['pending_start', 'running']);

      const currentConfigIds = new Set(potentiallyRunnableConfigs.map(c => c.id.toString()));

      // Stop strategies that are no longer active or present in DB
      this.activeStrategies.forEach((instance, configId) => {
        if (!currentConfigIds.has(configId)) {
          this.stopStrategyInstance(configId, 'Configuration removed or deactivated by user.');
        }
      });

      // Start or update existing ones
      for (const config of potentiallyRunnableConfigs) {
        const configId = config.id.toString();
        if (this.activeStrategies.has(configId)) {
          // Strategy already known, update its config if changed (e.g. parameters)
          // More complex diffing might be needed for parameter changes to reset state.
          const instance = this.activeStrategies.get(configId)!;
          instance.config = config;
          if (config.status === 'pending_start' && !instance.isRunning) {
             console.log(\`[StrategyEngine] Restarting strategy \${config.name} (\${configId}) due to pending_start status.\`);
             this.startStrategyInstance(config);
          } else if (config.isActive && !instance.isRunning && config.status !== 'error' && config.status !== 'stopped') {
             // If user reactivated it and it's not in a terminal state, try starting.
             console.log(\`[StrategyEngine] Attempting to start previously known strategy \${config.name} (\${configId}) as it is now active.\`);
             this.startStrategyInstance(config);
          } else if (!config.isActive && instance.isRunning) {
             this.stopStrategyInstance(configId, "Deactivated by user.");
          }

        } else {
          // New strategy to start
          if (config.isActive || config.status === 'pending_start') {
            this.startStrategyInstance(config);
          }
        }
      }
    } catch (error) {
      console.error('[StrategyEngine] Error loading/managing strategies:', error);
    }
  }

  private startStrategyInstance(config: IStrategyConfig): void {
    const configId = config.id.toString();
    if (this.activeStrategies.has(configId) && this.activeStrategies.get(configId)!.isRunning) {
        console.log(\`[StrategyEngine] Strategy \${config.name} (\${configId}) is already running.\`);
        return;
    }

    console.log(\`[StrategyEngine] Starting strategy instance: \${config.name} (\${configId})\`);

    // Mark as running in DB
    StrategyConfigService.updateStrategyStatus(configId, 'running', 'Engine started strategy.').catch(e =>
        console.error(\`[StrategyEngine] Error updating status to running for \${configId}:\`, e)
    );

    const instance: ActiveStrategyInstance = {
      config,
      isRunning: true,
      lastEvaluation: new Date(),
      consecutiveErrors: 0,
      strategyState: {}, // Initialize empty state
    };

    // Determine evaluation interval (from config.parameters or default)
    const intervalMs = (config.parameters as any)?.evaluationIntervalMs || DEFAULT_EVALUATION_INTERVAL_MS;

    instance.intervalHandle = setInterval(() => {
      if (instance.isRunning && this.isEngineRunning) {
        this.evaluateStrategy(instance);
      }
    }, intervalMs);

    this.activeStrategies.set(configId, instance);
    // Initial immediate evaluation
    this.evaluateStrategy(instance);
  }

  private stopStrategyInstance(configId: string, reason: string): void {
    const instance = this.activeStrategies.get(configId);
    if (instance) {
      console.log(\`[StrategyEngine] Stopping strategy instance: \${instance.config.name} (\${configId}). Reason: \${reason}\`);
      if (instance.intervalHandle) {
        clearInterval(instance.intervalHandle);
      }
      instance.isRunning = false;
      this.activeStrategies.delete(configId);
      // Update DB status
      StrategyConfigService.updateStrategyStatus(configId, 'stopped', reason).catch(e =>
        console.error(\`[StrategyEngine] Error updating status to stopped for \${configId}:\`, e)
      );
    }
  }

  private async evaluateStrategy(instance: ActiveStrategyInstance): Promise<void> {
    if (!instance.isRunning || !this.isEngineRunning) return;

    instance.lastEvaluation = new Date();
    const { config } = instance;
    console.log(\`[StrategyEngine] Evaluating strategy: \${config.name} (\${config.id}) for symbol \${config.symbol}\`);

    try {
      // --- 1. Fetch Market Data (from Redis Cache) ---
      if (!isRedisConnected()) {
        throw new Error("Redis is not connected. Cannot fetch market data for strategy evaluation.");
      }
      const redisClient = getRedisClient();
      const exchangeName = (config.exchangeConfig as any).exchangeName || 'unknown_exchange'; // Assuming populated or need to fetch
      const symbol = config.symbol;

      // Example: Fetch Ticker Data
      const tickerKey = getTickerKey(exchangeName, symbol);
      const tickerDataString = await redisClient.hGetAll(tickerKey);

      // Example: Fetch Order Book Data
      // const orderbookKey = getOrderbookKey(exchangeName, symbol);
      // const orderbookDataString = await redisClient.hGetAll(orderbookKey);

      if (!tickerDataString || Object.keys(tickerDataString).length === 0) {
        // console.warn(\`[StrategyEngine] No ticker data found in Redis for \${tickerKey} for strategy \${config.name}\`);
        // Decide if this is an error or just skip evaluation
        instance.consecutiveErrors = 0; // Reset error count if data is just missing, not an error state
        return;
      }
      const currentTicker: Partial<Ticker> = { // Reconstruct Ticker, ensure types
          last: parseFloat(tickerDataString.last),
          timestamp: parseInt(tickerDataString.timestamp, 10),
          // ... other fields as needed by strategy
      };

      // --- 2. Apply Strategy Logic (Placeholder for actual strategy implementations) ---
      // This is where specific strategy logic (MA Crossover, RSI, etc.) would go.
      // For now, a placeholder that randomly generates a signal.

      let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      const randomNumber = Math.random();
      if (randomNumber < 0.1) signal = 'BUY'; // 10% chance to BUY
      else if (randomNumber < 0.2) signal = 'SELL'; // 10% chance to SELL

      console.log(\`[StrategyEngine] Strategy '\${config.name}' on \${symbol} evaluated. Current price: \${currentTicker.last}. Signal: \${signal}\`);

      // --- 3. Publish Signal to Kafka (if not HOLD) ---
      if (signal !== 'HOLD') {
        const signalPayload = {
          strategyConfigId: config.id,
          strategyName: config.name,
          userId: config.user.toString(), // Ensure it's string for Kafka
          exchangeConfigId: config.exchangeConfig.toString(), // Ensure it's string
          exchange: exchangeName, // From populated exchangeConfig
          symbol: config.symbol,
          signal: signal, // 'BUY' or 'SELL'
          price: currentTicker.last, // Price at time of signal
          timestamp: new Date().toISOString(),
          parameters: config.parameters, // Strategy parameters that generated signal
          // Add confidence, target price, stop loss, etc. if strategy provides them
        };
        await this.producer.send({
          topic: KAFKA_TRADING_SIGNALS_TOPIC,
          messages: [{ key: config.symbol, value: JSON.stringify(signalPayload) }],
        });
        console.log(\`[StrategyEngine] Signal published for \${config.name}: \${signal} \${config.symbol} @ \${currentTicker.last}\`);
        StrategyConfigService.updateStrategyStatus(config.id.toString(), 'running', \`Signal \${signal} generated at \${new Date().toLocaleTimeString()}\`).catch(e => console.error("Failed to update strategy last signal time", e));
      }
      instance.consecutiveErrors = 0; // Reset error count on successful evaluation
      StrategyConfigService.updateStrategyStatus(config.id.toString(), 'running', 'Last evaluation successful.').catch(e=> {});


    } catch (error: any) {
      console.error(\`[StrategyEngine] Error evaluating strategy \${config.name} (\${config.id}):\`, error.message);
      instance.consecutiveErrors++;
      StrategyConfigService.updateStrategyStatus(config.id.toString(), 'error', \`Evaluation error: \${error.message}\`).catch(e=> {});
      if (instance.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error(\`[StrategyEngine] Strategy \${config.name} (\${config.id}) exceeded max consecutive errors. Stopping instance.\`);
        this.stopStrategyInstance(config.id.toString(), \`Exceeded max consecutive errors (\${MAX_CONSECUTIVE_ERRORS}). Last error: \${error.message}\`);
      }
    }
  }
}

const strategyEngineService = new StrategyEngineService();

// Export start/stop for server lifecycle integration
export const startStrategyEngine = async () => {
  await strategyEngineService.start();
};
export const stopStrategyEngine = async () => {
  await strategyEngineService.stop();
};

export default strategyEngineService; // For direct access if needed elsewhere
