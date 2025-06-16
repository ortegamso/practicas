import { connectTimescaleDB, disconnectTimescaleDB } from '../database/timescaledb';
import { connectMongoDB, disconnectMongoDB } from '../database/mongodb';

export const connectAllDBs = async () => {
  try {
    console.log('Attempting to connect to all databases...');
    await connectTimescaleDB();
    await connectMongoDB();
    console.log('All databases connected successfully.');
  } catch (error) {
    console.error('Error connecting to one or more databases:', error);
    throw error; // Propagate error for server startup to handle
  }
};

export const disconnectAllDBs = async () => {
  try {
    console.log('Attempting to disconnect from all databases...');
    await disconnectTimescaleDB();
    await disconnectMongoDB();
    console.log('All databases disconnected successfully.');
  } catch (error) {
    console.error('Error disconnecting from one or more databases:', error);
    // Decide if this should be fatal or just logged
  }
};
