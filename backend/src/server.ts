// Import config first to ensure environment variables are loaded
import config from './config';
import http from 'http';
import app from './app';
import { connectAllDBs, disconnectAllDBs } from './config/db.config';
import { initializeKafka, shutdownKafka } from './kafka'; // Kafka setup
import { startMarketDataFeed, stopMarketDataFeed } from './services/websocket/marketDataFeed.service';
import { startAllDataConsumers, stopAllDataConsumers } from './kafka/consumers';
import { connectRedis, disconnectRedis } from './redis';
import { startStrategyEngine, stopStrategyEngine } from './services/strategy-engine/engine.service';
import { startOracleProcessor, stopOracleProcessor } from './services/oracle/oracle.service';
// import { setupKafka } from './config/kafka.config'; // To be implemented
// import { setupRedis } from './config/redis.config'; // To be implemented

const PORT: number = config.port;

const server = http.createServer(app);

async function startServer() {
  try {
    // 1. Connect to Databases (TimescaleDB, MongoDB)
    await connectAllDBs();
    await initializeKafka();
    await connectRedis();
    await startMarketDataFeed(); // Start WebSocket feeds
    await startAllDataConsumers(); // Start Kafka Data Consumers
    await startStrategyEngine(); // Start Strategy Engine
    await startOracleProcessor(); // Start Oracle Processor

    // 2. Initialize Kafka Producers/Consumers
    // await setupKafka(); // Placeholder

    // 3. Initialize Redis Client
    // await setupRedis(); // Placeholder

    // 4. Start the HTTP server
    server.listen(PORT, () => {
      console.log(\`Backend server is running on http://localhost:\${PORT}\`);
      console.log(\`Current NODE_ENV: \${config.nodeEnv}\`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful Shutdown
async function gracefulShutdown(signal: string) {
  console.log(\`
Received \${signal}. Starting graceful shutdown...\`);

  // Stop the HTTP server from accepting new connections
  server.close(async (err) => {
    if (err) {
      console.error('Error during server close:', err);
      process.exit(1);
    }
    console.log('HTTP server closed.');

    // Disconnect from databases, Kafka, Redis, etc.
    // try {
    //   await disconnectAllDBs();
    //   await stopOracleProcessor(); // Stop Oracle Processor
    //   await stopStrategyEngine(); // Stop Strategy Engine
    //   await stopAllDataConsumers(); // Stop Kafka Data Consumers
    //   await stopMarketDataFeed(); // Stop WebSocket feeds
    //   await shutdownKafka();
    //   await disconnectRedis();
    //   // await shutdownRedis();
    // } catch (shutdownError) {
    //   console.error('Error during resource cleanup:', shutdownError);
    // }

    console.log('Graceful shutdown completed.');
    process.exit(0);
  });

  // If server hasn't finished in X seconds, force shutdown
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000); // 10 seconds
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Catches Ctrl+C

startServer();
