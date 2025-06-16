import { Kafka, Producer, Consumer, Admin, Partitioners, ITopicConfig } from 'kafkajs';
import { getKafkaClient, defaultProducerConfig, defaultConsumerConfig } from '../config/kafka.config';

let kafka: Kafka;
let producer: Producer | null = null;
let admin: Admin | null = null;
// Consumers are typically created per use case/service, not globally here, but we can have a function to create them.

export const getProducer = (): Producer => {
  if (!producer) {
    kafka = getKafkaClient(); // Ensures Kafka client is initialized
    producer = kafka.producer({
      ...defaultProducerConfig,
      // Use createPartitioner: Partitioners.LegacyPartitioner for compatibility if issues arise with default
      // For more control over partitioning, you might use:
      // createPartitioner: Partitioners.DefaultPartitioner // or custom
    });
    // It's important to connect the producer. This should ideally be done once.
    // We'll add a connectProducer function and call it during server startup.
  }
  return producer;
};

export const connectProducer = async (): Promise<void> => {
  const currentProducer = getProducer(); // Ensures producer is initialized
  try {
    await currentProducer.connect();
    console.log('[Kafka] Producer connected successfully.');
  } catch (error) {
    console.error('[Kafka] Failed to connect producer:', error);
    throw error; // Propagate to be handled by server startup
  }
};

export const disconnectProducer = async (): Promise<void> => {
  if (producer) {
    try {
      await producer.disconnect();
      console.log('[Kafka] Producer disconnected successfully.');
      producer = null; // Allow re-creation if needed
    } catch (error) {
      console.error('[Kafka] Failed to disconnect producer:', error);
      // Decide if this should be fatal or just logged
    }
  }
};

// Function to create a new consumer with a specific group ID
export const createConsumer = (groupId: string, consumerOptions?: Partial<Parameters<Kafka['consumer']>[0]>) => {
  kafka = getKafkaClient(); // Ensures Kafka client is initialized
  const consumer = kafka.consumer({
    ...defaultConsumerConfig(groupId),
    ...consumerOptions
  });
  return consumer; // Caller is responsible for connecting, subscribing, and running.
};


// Kafka Admin Client (optional, for managing topics, etc.)
export const getAdminClient = (): Admin => {
    if (!admin) {
        kafka = getKafkaClient();
        admin = kafka.admin();
    }
    return admin;
};

export const connectAdminClient = async (): Promise<void> => {
    const currentAdmin = getAdminClient();
    try {
        await currentAdmin.connect();
        console.log('[Kafka] Admin client connected successfully.');
    } catch (error) {
        console.error('[Kafka] Failed to connect admin client:', error);
        // Admin client connection failure might not be critical for app startup
    }
};

export const disconnectAdminClient = async (): Promise<void> => {
    if (admin) {
        try {
            await admin.disconnect();
            console.log('[Kafka] Admin client disconnected successfully.');
            admin = null;
        } catch (error) {
            console.error('[Kafka] Failed to disconnect admin client:', error);
        }
    }
};

// Helper function to ensure topics exist (useful for development)
export const ensureTopicsExist = async (topicsToEnsure: (string | ITopicConfig)[]): Promise<void> => {
    const adminClient = getAdminClient();
    if (!adminClient) { // Should not happen if getAdminClient is called, which initializes kafka
        console.error("[Kafka] Admin client not available for ensureTopicsExist.");
        return;
    }
    // Ensure admin client is connected if not already
    // This is a simplified check; robust check would involve connection state.
    // For now, assume connectAdminClient is called at startup.

    try {
        const existingTopics = await adminClient.listTopics();
        console.log('[Kafka Admin] Existing topics:', existingTopics);

        const topicConfigs: ITopicConfig[] = topicsToEnsure.map(topic =>
            typeof topic === 'string' ? { topic, numPartitions: 1, replicationFactor: 1 } : topic
        );

        const topicsToCreate = topicConfigs.filter(
            (tc) => !existingTopics.includes(tc.topic)
        );

        if (topicsToCreate.length > 0) {
            console.log('[Kafka Admin] Topics to create:', topicsToCreate.map(t => t.topic));
            await adminClient.createTopics({
                validateOnly: false,
                waitForLeaders: true,
                timeout: 5000, // ms
                topics: topicsToCreate,
            });
            console.log('[Kafka Admin] Topics created successfully or already existed.');
        } else {
            console.log('[Kafka Admin] All specified topics already exist.');
        }
    } catch (error) {
        console.error('[Kafka Admin] Error ensuring topics exist:', error);
        // Log and continue, as topic creation might fail due to permissions or broker config
    }
};


// Central Kafka setup function to be called from server.ts
export const initializeKafka = async () => {
    console.log('[Kafka] Initializing Kafka components...');
    getKafkaClient(); // Initialize client first
    await connectProducer();
    await connectAdminClient(); // Connect admin client

    // Example: Ensure some default topics exist during development
    if (process.env.NODE_ENV !== 'production') {
        // Define topics as ITopicConfig for more control if needed
        const exampleTopics: ITopicConfig[] = [
            { topic: 'marketdata.default.orders', numPartitions: 3, replicationFactor: 1 },
            { topic: 'marketdata.default.trades', numPartitions: 3, replicationFactor: 1 },
            { topic: 'trading.signals', numPartitions: 1, replicationFactor: 1 },
        ];
        // await ensureTopicsExist(exampleTopics); // Uncomment if auto topic creation is desired and admin client works
    }
    console.log('[Kafka] Kafka components initialized (Producer & Admin Client connected).');
};

export const shutdownKafka = async () => {
    console.log('[Kafka] Shutting down Kafka components...');
    await disconnectProducer();
    await disconnectAdminClient();
    // Kafka client itself doesn't have a disconnect method in KafkaJS v2
    console.log('[Kafka] Kafka components shut down.');
};

console.log('Kafka module loaded (client, producer, admin setup).');
