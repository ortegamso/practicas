import { Kafka, logLevel as KafkaLogLevel, ProducerConfig, ConsumerConfig, KafkaConfig } from 'kafkajs';
import config from './index'; // Main app config

// Translate app log level to KafkaJS log level
const getKafkaLogLevel = () => {
  switch (config.nodeEnv) {
    case 'development':
      return KafkaLogLevel.INFO; // Or DEBUG for more verbosity
    case 'production':
      return KafkaLogLevel.WARN;
    case 'test':
      return KafkaLogLevel.NOTHING; // No logs during tests
    default:
      return KafkaLogLevel.INFO;
  }
};

export const kafkaConfigOptions: KafkaConfig = {
  clientId: config.kafka.clientId || 'crypto-trading-app',
  brokers: config.kafka.brokers, // Expects an array of 'host:port' strings
  logLevel: getKafkaLogLevel(),
  // connectionTimeout: 3000, // milliseconds
  // requestTimeout: 30000, // milliseconds
  // ssl: true, // if using SSL
  // sasl: { // if using SASL authentication
  //   mechanism: 'plain', // scram-sha-256, scram-sha-512
  //   username: 'your-username',
  //   password: 'your-password',
  // },
  // retry: { // Default retry configuration
  //   initialRetryTime: 100, // milliseconds
  //   retries: 8
  // }
};

export const defaultProducerConfig: ProducerConfig = {
  allowAutoTopicCreation: true, // Convenient for dev, might disable in prod
  // idempotent: true, // Ensures messages are written exactly once, requires maxInFlightRequests=1
  // maxInFlightRequests: 1, // Required if idempotent=true
  // transactionalId: 'my-transactional-producer', // For transactions
};

export const defaultConsumerConfig = (groupId: string): ConsumerConfig => ({
  groupId: groupId, // Each consumer group needs a unique groupId
  allowAutoTopicCreation: true, // Convenient for dev
  // sessionTimeout: 30000, // milliseconds
  // rebalanceTimeout: 60000, // milliseconds
  // heartbeatInterval: 3000, // milliseconds
  // maxBytesPerPartition: 1 * 1024 * 1024, // 1MB
  // fetch: {
  //   minBytes: 1,
  //   maxBytes: 10 * 1024 * 1024, // 10MB
  //   maxWaitTimeInMs: 5000,
  // },
  // fromBeginning: false, // Start consuming from the latest offset
});

// Initialize Kafka client globally (or pass it around)
// This instance can be shared by producers and consumers.
let kafkaClient: Kafka | null = null;

export const getKafkaClient = (): Kafka => {
    if (!kafkaClient) {
        if (config.kafka.brokers.length === 0 || config.kafka.brokers[0] === '' || config.kafka.brokers[0].includes('undefined')) {
            // This check is a bit rudimentary, ideally brokers config should be validated earlier.
            console.error("[KAFKA FATAL] Kafka brokers are not configured properly. Kafka client cannot be initialized.");
            throw new Error("Kafka brokers are not configured. Cannot initialize Kafka client.");
        }
        console.log(\`[Kafka] Initializing Kafka client with brokers: \${config.kafka.brokers.join(', ')} and clientId: \${kafkaConfigOptions.clientId}\`);
        kafkaClient = new Kafka(kafkaConfigOptions);
    }
    return kafkaClient;
};

// Optional: Functions to connect/disconnect producer/consumer if managed centrally
// However, typically producer/consumer connect/disconnect is handled where they are used.

console.log('Kafka configuration module loaded.');
