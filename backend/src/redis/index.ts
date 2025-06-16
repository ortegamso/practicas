import { createClient, RedisClientType, RedisClientOptions } from 'redis';
import config from '../config';

let redisClient: RedisClientType | null = null;
let isConnected = false;

const redisOptions: RedisClientOptions = {
  socket: {
    host: config.redis.host,
    port: config.redis.port,
    connectTimeout: 5000, // 5 seconds
  },
  password: config.redis.password, // Will be undefined if not set, which is fine for no-auth Redis
  // Optional: Add more Redis client options if needed
  // e.g., database: 0, legacyMode: false (default for v4+)
};

export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    console.log(\`[Redis] Creating new Redis client with options: \${JSON.stringify({host: redisOptions.socket?.host, port: redisOptions.socket?.port})}\`);
    // @ts-ignore - createClient doesn't show RedisClientType directly in some generic typings but it is.
    redisClient = createClient(redisOptions);

    redisClient.on('connect', () => {
      isConnected = true;
      console.log('[Redis] Client connecting...');
    });
    redisClient.on('ready', () => {
        isConnected = true; // Should be truly ready here
        console.log('[Redis] Client ready and connected to server.');
    });
    redisClient.on('end', () => {
      isConnected = false;
      console.log('[Redis] Client connection ended.');
      // Optionally attempt to reconnect or handle cleanup
    });
    redisClient.on('error', (err) => {
      // isConnected might be true or false here depending on when error occurs
      console.error('[Redis] Client Error:', err);
      // If error occurs during initial connection, connect() will reject.
      // If error occurs after connection, it might lead to 'end'.
    });
    redisClient.on('reconnecting', () => {
        isConnected = false; // Not fully connected during reconnecting phase
        console.log('[Redis] Client reconnecting...');
    });
  }
  return redisClient;
};

export const connectRedis = async (): Promise<void> => {
  const client = getRedisClient(); // Ensures client is initialized
  if (!client.isOpen) { // isOpen is a good check before calling connect
    try {
      await client.connect();
      // isConnected will be set by 'ready' or 'connect' event handlers
    } catch (error) {
      console.error('[Redis] Failed to connect to Redis:', error);
      // isConnected remains false or is set by 'error' handler
      throw error; // Propagate to be handled by server startup
    }
  } else {
    console.log('[Redis] Client already connected or connecting.');
  }
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.quit(); // Graceful shutdown
      console.log('[Redis] Client disconnected successfully.');
    } catch (error) {
      console.error('[Redis] Failed to disconnect Redis client:', error);
      // If quit fails, you might need to forcefully close with .disconnect()
      // await redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
    }
  } else {
    console.log('[Redis] Client was not connected or already disconnected.');
  }
};

// Helper to check connection status
export const isRedisConnected = (): boolean => {
    return redisClient?.isReady ?? false; // isReady is a good indicator for usability
};

// --- Redis Key Naming Conventions ---
// market:{exchange}:{symbol}:{dataType}
// e.g., market:binance:btcusdt:orderbook (Hash for bids/asks)
// e.g., market:bybit:ethusdt:trades (List for recent trades)
// e.g., market:binance:btcusdt:ticker (Hash for ticker fields)

export const getOrderbookKey = (exchange: string, symbol: string): string =>
  \`market:\${exchange.toLowerCase()}:\${symbol.replace('/', '').toLowerCase()}:orderbook\`;

export const getTradesKey = (exchange: string, symbol: string): string =>
  \`market:\${exchange.toLowerCase()}:\${symbol.replace('/', '').toLowerCase()}:trades\`;

export const getTickerKey = (exchange: string, symbol: string): string =>
  \`market:\${exchange.toLowerCase()}:\${symbol.replace('/', '').toLowerCase()}:ticker\`;


console.log('Redis module loaded.');
