import { startOrderbookConsumer, stopOrderbookConsumer } from './marketDataOrderbook.consumer';
import { startTradeConsumer, stopTradeConsumer } from './marketDataTrade.consumer';
import { startTickerConsumer, stopTickerConsumer } from './marketDataTicker.consumer';
import { startOrderExecutionConsumer, stopOrderExecutionConsumer } from '../../services/trading/orderExecution.service';

// Add other consumer start/stop functions here as they are created

export const startAllDataConsumers = async () => {
  console.log('[Kafka Consumers] Starting all data persistence consumers...');
  await Promise.all([
    startOrderbookConsumer(),
    startTradeConsumer(),
    startTickerConsumer(),
    startOrderExecutionConsumer(),
    // Call other startConsumer functions here
  ]).catch(error => {
    console.error('[Kafka Consumers] Error starting one or more consumers:', error);
    // Optionally, attempt to stop any that might have started
    // await stopAllDataConsumers(); // Be careful with calling stop in a catch of start
    throw error; // Re-throw to indicate startup failure
  });
  console.log('[Kafka Consumers] All data persistence consumers initiated.');
};

export const stopAllDataConsumers = async () => {
  console.log('[Kafka Consumers] Stopping all data persistence consumers...');
  await Promise.all([
    stopOrderbookConsumer(),
    stopTradeConsumer(),
    stopTickerConsumer(),
    stopOrderExecutionConsumer(),
    // Call other stopConsumer functions here
  ]).catch(error => {
    console.error('[Kafka Consumers] Error stopping one or more consumers:', error);
  });
  console.log('[Kafka Consumers] All data persistence consumers stopped.');
};
