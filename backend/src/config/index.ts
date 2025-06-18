import dotenv from 'dotenv';
import path from 'path';

// Determine the environment and load the appropriate .env file
const env = process.env.NODE_ENV || 'development';
const envPath = path.resolve(__dirname, \`../../../.env.\${env}\`); // e.g., .env.development
const defaultEnvPath = path.resolve(__dirname, '../../../.env'); // e.g., .env
const secretsEnvPath = path.resolve(__dirname, '../../../.secrets.env'); // .secrets.env

// Load default .env file first, then environment-specific, then secrets
// This allows for overriding general settings with environment-specific ones,
// and then with secrets.
dotenv.config({ path: defaultEnvPath });
if (env !== 'production') { // In production, rely on environment variables set by the infrastructure
    dotenv.config({ path: envPath, override: true });
}
dotenv.config({ path: secretsEnvPath, override: true }); // Secrets should always override

// Validate essential configurations (example)
const requiredConfigs = [
    'NODE_ENV',
    'PORT',
    'JWT_SECRET',
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_DB',
    'POSTGRES_USER',
    // 'POSTGRES_PASSWORD', // Password might be injected in prod and not in .env
    'MONGO_HOST',
    'MONGO_PORT',
    'MONGO_DATABASE',
    // 'MONGO_USER', // Optional if not using auth for mongo in dev
    // 'MONGO_PASSWORD', // Optional
    'KAFKA_BROKERS',
    'REDIS_HOST',
    'REDIS_PORT',
];

// In development or testing, check for missing required configurations
if (env !== 'production') {
    const missingConfigs = requiredConfigs.filter(key => !process.env[key]);
    if (missingConfigs.length > 0) {
        // This is a soft warning during development. For critical missing configs, you might throw an error.
        console.warn(\`[CONFIG WARNING] Missing required environment variables: \${missingConfigs.join(', ')}\`);
        console.warn('Please ensure they are set in your .env, .env.<environment>, or .secrets.env file, or system environment.');
    }
}


interface AppConfig {
    nodeEnv: string;
    port: number;
    apiBaseUrl: string;
    jwt: {
        secret: string;
        expiresIn: string;
    };
    database: {
        postgres: {
            host: string;
            port: number;
            db: string;
            user: string;
            password?: string; // Password can be optional if using other auth methods or for dev
        };
        mongo: {
            host: string;
            port: number;
            db: string;
            user?: string;
            password?: string;
            uri?: string; // For connection string
        };
    };
    kafka: {
        brokers: string[];
        clientId?: string;
        groupId?: string;
    };
    redis: {
        host: string;
        port: number;
        password?: string;
    };
    web3?: {
      ethereumRpcUrl?: string;
      solanaRpcUrl?: string;
    };
    smtp?: {
      host?: string;
      port?: number;
      secure?: boolean;
      user?: string;
      pass?: string;
      fromAddress?: string;
      fromName?: string;
    };
    // Add other configurations as needed
    // e.g., exchangeApiKeys, web3RpcUrls, etc.
}

const config: AppConfig = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '4000', 10),
    apiBaseUrl: process.env.API_BASE_URL || \`http://localhost:\${process.env.PORT || 4000}/api/v1\`,
    jwt: {
        secret: process.env.JWT_SECRET || 'your_default_development_secret_key_min_32_chars',
        expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    },
    database: {
        postgres: {
            host: process.env.POSTGRES_HOST || 'timescaledb',
            port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
            db: process.env.POSTGRES_DB || 'crypto_trading_db',
            user: process.env.POSTGRES_USER || 'user',
            password: process.env.POSTGRES_PASSWORD, // Will be undefined if not set
        },
        mongo: {
            host: process.env.MONGO_HOST || 'mongodb',
            port: parseInt(process.env.MONGO_PORT || '27017', 10),
            db: process.env.MONGO_DATABASE || 'ecommerce_db',
            user: process.env.MONGO_USER,
            password: process.env.MONGO_PASSWORD,
            // Construct MongoDB URI, prefer process.env.MONGO_URI if available
            uri: process.env.MONGO_URI ||
                 (process.env.MONGO_USER && process.env.MONGO_PASSWORD
                   ? \`mongodb://\${process.env.MONGO_USER}:\${process.env.MONGO_PASSWORD}@\${process.env.MONGO_HOST || 'mongodb'}:\${parseInt(process.env.MONGO_PORT || '27017', 10)}/\${process.env.MONGO_DATABASE || 'ecommerce_db'}?authSource=admin\`
                   : \`mongodb://\${process.env.MONGO_HOST || 'mongodb'}:\${parseInt(process.env.MONGO_PORT || '27017', 10)}/\${process.env.MONGO_DATABASE || 'ecommerce_db'}\`)
        },
    },
    kafka: {
        brokers: (process.env.KAFKA_BROKERS || 'kafka:29092').split(','),
        clientId: process.env.KAFKA_CLIENT_ID || 'crypto-trader-backend',
        groupId: process.env.KAFKA_GROUP_ID || 'trading-group',
    },
    redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
    },
  web3: {
    ethereumRpcUrl: process.env.ETHEREUM_RPC_URL,
    solanaRpcUrl: process.env.SOLANA_RPC_URL,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@cryptoplatform.example',
    fromName: process.env.EMAIL_FROM_NAME || 'Crypto Platform Notifications',
  },
};

// Log JWT secret source for debugging in non-production
if (config.nodeEnv !== 'production') {
    if (config.jwt.secret === 'your_default_development_secret_key_min_32_chars') {
        console.warn("[CONFIG WARNING] Using default JWT secret. Please set a strong JWT_SECRET in your .env or .secrets.env file.");
    }
    if (!config.database.postgres.password) {
        console.warn("[CONFIG WARNING] POSTGRES_PASSWORD is not set. Database connection might fail if password is required.");
    }
     if (!config.database.mongo.password && config.database.mongo.user) {
        console.warn("[CONFIG WARNING] MONGO_PASSWORD is not set while MONGO_USER is. MongoDB connection might fail or operate without authentication.");
    }
}


export default config;
