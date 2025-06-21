-- Enable TimescaleDB extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Users and Permissions
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER, -- Can be linked to a roles table
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
    -- FOREIGN KEY (role_id) REFERENCES roles(id) -- Uncomment if roles table is added
);

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE role_permissions (
    role_id INTEGER REFERENCES roles(id),
    permission VARCHAR(100) NOT NULL, -- e.g., 'manage_users', 'trade_futures'
    PRIMARY KEY (role_id, permission)
);

-- Exchange Configurations
CREATE TABLE exchange_configs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    exchange_name VARCHAR(50) NOT NULL, -- e.g., 'binance', 'bybit'
    api_key_hash VARCHAR(255) NOT NULL, -- Store hash of API key, not the key itself if possible, or encrypted
    api_secret_encrypted TEXT NOT NULL, -- Encrypted API secret
    is_testnet BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, exchange_name, is_testnet)
);

-- Market Data
CREATE TABLE symbols (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) UNIQUE NOT NULL, -- e.g., 'BTC/USDT'
    exchange VARCHAR(50) NOT NULL, -- e.g., 'binance_futures'
    asset_type VARCHAR(20) DEFAULT 'futures', -- 'futures', 'spot'
    base_asset VARCHAR(10),
    quote_asset VARCHAR(10),
    is_active BOOLEAN DEFAULT TRUE
);

-- Time-series data for Futures (Hypertables)
CREATE TABLE order_books_futures (
    time TIMESTAMPTZ NOT NULL,
    symbol_id INTEGER REFERENCES symbols(id),
    exchange VARCHAR(50) NOT NULL,
    bids JSONB, -- [[price, quantity], ...]
    asks JSONB, -- [[price, quantity], ...]
    PRIMARY KEY (time, symbol_id, exchange)
);
SELECT create_hypertable('order_books_futures', 'time');

CREATE TABLE mini_tickers_futures (
    time TIMESTAMPTZ NOT NULL,
    symbol_id INTEGER REFERENCES symbols(id),
    exchange VARCHAR(50) NOT NULL,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume NUMERIC,
    quote_volume NUMERIC,
    PRIMARY KEY (time, symbol_id, exchange)
);
SELECT create_hypertable('mini_tickers_futures', 'time');

CREATE TABLE trades_futures (
    time TIMESTAMPTZ NOT NULL,
    symbol_id INTEGER REFERENCES symbols(id),
    exchange VARCHAR(50) NOT NULL,
    trade_id VARCHAR(100), -- Exchange specific trade ID
    price NUMERIC NOT NULL,
    quantity NUMERIC NOT NULL,
    side VARCHAR(4), -- 'buy' or 'sell'
    is_maker BOOLEAN,
    PRIMARY KEY (time, symbol_id, exchange, trade_id)
);
SELECT create_hypertable('trades_futures', 'time');

-- Trading Strategies and Bots
CREATE TABLE strategies_config (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    script_id INTEGER, -- Link to marketplace scripts if applicable
    parameters JSONB, -- Strategy specific parameters
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
    -- FOREIGN KEY (script_id) REFERENCES marketplace_scripts(id) -- If marketplace table exists
);

CREATE TABLE bot_orders (
    id SERIAL PRIMARY KEY,
    strategy_id INTEGER REFERENCES strategies_config(id),
    user_id INTEGER REFERENCES users(id),
    exchange_order_id VARCHAR(100),
    exchange VARCHAR(50) NOT NULL,
    symbol_id INTEGER REFERENCES symbols(id),
    type VARCHAR(10) NOT NULL, -- 'limit', 'market'
    side VARCHAR(4) NOT NULL, -- 'buy', 'sell'
    price NUMERIC,
    quantity NUMERIC NOT NULL,
    status VARCHAR(20) NOT NULL, -- 'open', 'closed', 'canceled', 'failed'
    leverage NUMERIC DEFAULT 1,
    margin_type VARCHAR(10) DEFAULT 'isolated', -- 'isolated', 'cross'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
SELECT create_hypertable('bot_orders', 'created_at'); -- Or 'updated_at' if more queries on that

CREATE TABLE bot_transactions (
    id SERIAL PRIMARY KEY,
    bot_order_id INTEGER REFERENCES bot_orders(id),
    user_id INTEGER REFERENCES users(id),
    exchange VARCHAR(50) NOT NULL,
    symbol_id INTEGER REFERENCES symbols(id),
    price NUMERIC NOT NULL,
    quantity NUMERIC NOT NULL,
    fee NUMERIC,
    fee_currency VARCHAR(10),
    transaction_time TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, transaction_time) -- id should be enough if it's serial
);
SELECT create_hypertable('bot_transactions', 'transaction_time');

-- Wallet and Performance
CREATE TABLE wallet_balances (
    time TIMESTAMPTZ NOT NULL,
    user_id INTEGER REFERENCES users(id),
    exchange VARCHAR(50) NOT NULL,
    asset VARCHAR(20) NOT NULL,
    total_balance NUMERIC NOT NULL,
    available_balance NUMERIC NOT NULL,
    PRIMARY KEY (time, user_id, exchange, asset)
);
SELECT create_hypertable('wallet_balances', 'time');

CREATE TABLE performance_metrics (
    time TIMESTAMPTZ NOT NULL,
    strategy_id INTEGER REFERENCES strategies_config(id),
    user_id INTEGER REFERENCES users(id),
    metric_name VARCHAR(50) NOT NULL, -- e.g., 'pnl', 'sharpe_ratio', 'win_rate'
    value NUMERIC NOT NULL,
    PRIMARY KEY (time, strategy_id, user_id, metric_name)
);
SELECT create_hypertable('performance_metrics', 'time');

-- System Logs
CREATE TABLE logs (
    time TIMESTAMPTZ NOT NULL,
    level VARCHAR(10) NOT NULL, -- 'info', 'warn', 'error'
    service VARCHAR(50), -- 'backend', 'kafka_consumer', 'strategy_engine'
    message TEXT,
    context JSONB
);
SELECT create_hypertable('logs', 'time');

-- Trade Signals (from Oracle or Strategies)
CREATE TABLE trade_signals (
    time TIMESTAMPTZ NOT NULL,
    source VARCHAR(100) NOT NULL, -- e.g., 'oracle_momentum', 'strategy_xyz'
    symbol_id INTEGER REFERENCES symbols(id),
    exchange VARCHAR(50),
    signal_type VARCHAR(10) NOT NULL, -- 'LONG', 'SHORT', 'HOLD'
    confidence NUMERIC, -- e.g., 0.0 to 1.0
    target_price NUMERIC,
    stop_loss NUMERIC,
    take_profit NUMERIC,
    details JSONB,
    PRIMARY KEY (time, source, symbol_id)
);
SELECT create_hypertable('trade_signals', 'time');

-- Seeder script placeholder (to be in seeder.sql)
-- INSERT INTO roles (name) VALUES ('admin'), ('user'), ('trader');
-- INSERT INTO users (username, email, password_hash, role_id) VALUES ('admin', 'admin@example.com', 'hashed_password', 1);

-- Note: This is a foundational schema.
-- Further refinements, indexes, and constraints will be needed.
-- For example, proper indexing on foreign keys and frequently queried columns.


-- Table for storing processed Footprint Chart data
CREATE TABLE footprints_futures (
    id BIGSERIAL PRIMARY KEY, -- Using BIGSERIAL for potentially high volume of footprint bars
    symbol_id INTEGER REFERENCES symbols(id) ON DELETE CASCADE, -- Foreign key to symbols table
    exchange VARCHAR(50) NOT NULL,
    interval_type VARCHAR(20) NOT NULL, -- e.g., '1m', '5m', '1000v' (volume), '100d' (delta)
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    open_price NUMERIC,
    high_price NUMERIC,
    low_price NUMERIC,
    close_price NUMERIC,
    total_volume NUMERIC,
    total_delta NUMERIC,       -- Total (Ask Volume - Bid Volume) for the bar
    poc_price NUMERIC,         -- Point of Control: Price level with the highest volume in the bar
    value_area_high NUMERIC,   -- Highest price of the value area (e.g., 70% of volume)
    value_area_low NUMERIC,    -- Lowest price of the value area
    footprint_data JSONB NOT NULL, -- Stores the detailed array of price levels:
                                   -- [{ price: X, bidVolume: Y, askVolume: Z, delta: D, imbalanceFlag: 'bid'/'ask'/null }, ...]
    CONSTRAINT uq_footprint_bar UNIQUE (symbol_id, exchange, interval_type, start_time)
);

-- Create hypertables for footprints_futures
SELECT create_hypertable('footprints_futures', 'start_time');

-- Optional: Indexes for footprints_futures for common queries
CREATE INDEX IF NOT EXISTS idx_footprints_symbol_exchange_interval_time
    ON footprints_futures (symbol_id, exchange, interval_type, start_time DESC, end_time DESC);
CREATE INDEX IF NOT EXISTS idx_footprints_exchange_interval_time
    ON footprints_futures (exchange, interval_type, start_time DESC);
-- Consider an index on footprint_data using GIN if querying specific content within the JSONB
-- CREATE INDEX IF NOT EXISTS idx_footprints_data_gin ON footprints_futures USING GIN (footprint_data);
