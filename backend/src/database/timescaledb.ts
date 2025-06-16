import { Pool, Client } from 'pg';
import config from '../config';

const { host, port, db, user, password } = config.database.postgres;

const pool = new Pool({
  user,
  host,
  database: db,
  password,
  port,
  // ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined, // Basic SSL example for production
  // connectionTimeoutMillis: 5000, // How long to wait if a connection cannot be established
  // idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
});

pool.on('connect', (client) => {
  console.log('TimescaleDB (PostgreSQL) pool connected.');
  // You can set session parameters here if needed, e.g., client.query('SET search_path TO my_schema');
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle TimescaleDB (PostgreSQL) client', err);
  // process.exit(-1); // Or handle more gracefully
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (config.nodeEnv === 'development') {
        console.log('[DB_QUERY]', { text, duration: \`\${duration}ms\`, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('[DB_ERROR] Error executing query:', { text, params, error });
    throw error;
  }
};

export const getClient = async () => {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;

  // Monkey patch the query method to keep logs and potential transactions consistent
  // @ts-ignore
  client.query = (...args: any[]) => {
    if (config.nodeEnv === 'development') {
        console.log('[DB_CLIENT_QUERY]', args[0]);
    }
    // @ts-ignore
    return query.apply(client, args);
  };
  return client;
};

export const connectTimescaleDB = async () => {
  try {
    const client = await pool.connect();
    console.log(\`Successfully connected to TimescaleDB (PostgreSQL) on \${host}:\${port}, database "\${db}"\`);
    // Test query
    const timeResult = await client.query('SELECT NOW()');
    console.log('TimescaleDB current time:', timeResult.rows[0].now);
    client.release();
  } catch (error) {
    console.error('Failed to connect to TimescaleDB (PostgreSQL):', error);
    throw error; // Re-throw to be caught by server startup
  }
};

export const disconnectTimescaleDB = async () => {
  try {
    await pool.end();
    console.log('TimescaleDB (PostgreSQL) pool has been closed.');
  } catch (error) {
    console.error('Error closing TimescaleDB (PostgreSQL) pool:', error);
    // process.exit(1); // Or handle more gracefully
  }
};

export default pool; // Export the pool for direct use if needed
