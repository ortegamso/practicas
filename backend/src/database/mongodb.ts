import mongoose from 'mongoose';
import config from '../config';

const { uri, db } = config.database.mongo;

const connectMongoDB = async () => {
  if (!uri) {
    console.error('MongoDB URI is not defined. Please check your configuration.');
    throw new Error('MongoDB URI is undefined.');
  }

  try {
    mongoose.set('strictQuery', false); // Optional: Mongoose 7 preparation

    // Event listeners for Mongoose connection
    mongoose.connection.on('connecting', () => {
      console.log('Connecting to MongoDB...');
    });

    mongoose.connection.on('connected', () => {
      console.log(\`Successfully connected to MongoDB: \${db}\`);
    });

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected.');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected.');
    });

    await mongoose.connect(uri, {
      // useNewUrlParser: true, // Deprecated in Mongoose 6+
      // useUnifiedTopology: true, // Deprecated in Mongoose 6+
      // useCreateIndex: true, // Not supported in Mongoose 6+
      // useFindAndModify: false, // Not supported in Mongoose 6+
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      // autoIndex: config.nodeEnv === 'development', // Auto build indexes in dev
    });

  } catch (error) {
    console.error('Failed to connect to MongoDB initially:', error);
    // Mongoose will attempt to reconnect automatically based on its internal logic
    // For critical startup, re-throwing might be desired:
    throw error;
  }
};

const disconnectMongoDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB connection has been closed.');
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    // process.exit(1); // Or handle more gracefully
  }
};

export { connectMongoDB, disconnectMongoDB };
