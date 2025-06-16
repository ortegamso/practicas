# Crypto Trading Bot - Backend

This directory contains the backend application for the Crypto Trading Bot and Marketplace platform. It's built with Node.js, Express, TypeScript, and connects to TimescaleDB (PostgreSQL) and MongoDB.

## Table of Contents

- [Project Overview](#project-overview)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment Setup](#environment-setup)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [API Endpoints](#api-endpoints)
- [Development Plan (Phased Approach)](#development-plan-phased-approach)
  - [Phase 1: Core Infrastructure and User Management](#phase-1-core-infrastructure-and-user-management)
  - [Phase 2: Exchange Integration and Core Trading Logic](#phase-2-exchange-integration-and-core-trading-logic)
  - [Phase 3: Kafka Integration & Real-time Data Processing](#phase-3-kafka-integration--real-time-data-processing)
  - [Phase 4: Strategy Engine & Oracle](#phase-4-strategy-engine--oracle)
  - [Phase 5: E-commerce, Referrals, and Support](#phase-5-e-commerce-referrals-and-support)
  - [Phase 6: Marketplace & Sandbox Integration](#phase-6-marketplace--sandbox-integration)
  - [Phase 7: Advanced Features & Polish](#phase-7-advanced-features--polish)
- [Key Components Overview](#key-components-overview)
- [Contributing](#contributing)
- [License](#license)

## Project Overview

The backend serves as the central nervous system for the platform, handling:
- User authentication and authorization.
- Connections to multiple cryptocurrency exchanges (CeFi).
- Real-time market data ingestion and processing via WebSockets and Kafka.
- Trade execution and management.
- Strategy execution via a modular engine.
- Secure execution of user-submitted trading scripts in a sandboxed environment.
- E-commerce functionality for selling bots and services.
- A multi-level referral system.
- Support ticketing system.
- Web3 integration for DeFi analysis and arbitrage.

## Getting Started

### Prerequisites

- Node.js (v18.x or later recommended)
- npm or yarn
- Docker and Docker Compose (for running dependent services like databases, Kafka, etc.)
- Access to a terminal or command prompt.

### Environment Setup

1.  **Clone the main repository** (if you haven't already).
2.  **Navigate to the project root.**
3.  **Copy Environment Files:**
    - Copy \`.env.example\` to \`.env\`.
    - Copy \`.secrets.env.example\` (if provided, otherwise create \`.secrets.env\`) and fill in your actual secrets.
    - Review \`.dockerenv\` for Docker-specific environment variables.

    Update these files with your specific configurations:
    -   \`backend/.env\`: For general development settings.
    -   \`backend/.secrets.env\`: For sensitive information like API keys, database passwords, JWT secrets. **This file is gitignored.**
    Ensure variables like database credentials, JWT_SECRET, Kafka brokers, Redis details are correctly set. The application expects these to be available.

### Installation

1.  **Navigate to the backend directory:**
    \`\`\`bash
    cd backend
    \`\`\`
2.  **Install dependencies:**
    \`\`\`bash
    npm install
    # OR
    # yarn install
    \`\`\`

### Running the Application

1.  **Start Dependent Services (from project root):**
    Ensure Docker is running. Then, from the **root directory of the entire project** (not the \`backend\` directory), start the services defined in \`docker-compose.yml\`:
    \`\`\`bash
    docker-compose up -d timescaledb mongodb kafka zookeeper redis
    # You can add other services like 'grafana' if needed
    \`\`\`
    Wait for these services to initialize. You can check their logs using \`docker-compose logs -f <service_name>\`.

2.  **Run Database Migrations/Initializations (if applicable):**
    The initial schema is in \`/scripts/database.sql\`. You'll need a PostgreSQL client (like \`psql\` or a GUI tool) to connect to the TimescaleDB instance and run this script.
    -   Connect to \`localhost:5432\` (or as per your \`.env\` config) with user/password/database from your \`.env\` file.
    -   Execute the content of \`/scripts/database.sql\`.
    -   Optionally, run \`/scripts/seeder.sql\` for initial data.

3.  **Run the Backend Server (from \`backend\` directory):**
    -   **Development Mode (with hot-reloading using nodemon):**
        \`\`\`bash
        npm run dev
        \`\`\`
    -   **Production Mode (after building):**
        \`\`\`bash
        npm run build
        npm start
        \`\`\`
    The server should start on the port specified in your \`.env\` file (default: 4000). You'll see a log message: \`Backend server is running on http://localhost:4000\`.

## Project Structure

\`\`\`
/backend
├── Dockerfile              # For building the backend Docker image
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript compiler options
├── .eslintrc.js            # ESLint configuration
├── src/                    # Source code
│   ├── app.ts              # Express application setup, middlewares, global error handling
│   ├── server.ts           # HTTP server initialization, graceful shutdown
│   ├── config/             # Configuration files (env loading, db, kafka)
│   ├── database/           # Database connection logic (TimescaleDB, MongoDB)
│   ├── models/             # Mongoose schemas (MongoDB) and potentially type definitions for TimescaleDB
│   ├── routes/             # API route definitions
│   ├── controllers/        # Route handlers, request/response logic
│   ├── services/           # Business logic, interaction with data layers
│   ├── middlewares/        # Custom Express middlewares (auth, validation, logging)
│   ├── utils/              # Utility functions (error handling, helpers)
│   ├── websocket/          # WebSocket client logic for exchange data
│   ├── kafka/              # Kafka producers and consumers
│   ├── redis/              # Redis client and caching logic
│   ├── strategy-engine/    # Core trading strategy execution engine
│   ├── oracle/             # Market analysis and signal generation
│   ├── web3/               # Web3/DeFi integration components
│   ├── store/              # E-commerce module
│   ├── support/            # Support ticket module
│   ├── referrals/          # Referral system module
│   ├── analytics/          # Data analytics and reporting
│   ├── notifications/      # Notification services (email, Telegram)
│   ├── risk/               # Risk management components
│   ├── trading/            # Core trading logic, CCXT integration
│   ├── auth/               # Authentication and authorization
│   ├── marketplace/        # Script marketplace logic
│   └── sandbox/            # Secure script execution sandbox integration
└── scripts/                # Backend-specific scripts (e.g., database.sql, seeder.sql - though main ones are in root /scripts)
\`\`\`

## API Endpoints

(This section will be populated as routes are developed. Consider linking to Swagger/OpenAPI documentation here later.)

-   **Auth:**
    -   \`POST /api/v1/auth/register\`: Register a new user.
    -   \`POST /api/v1/auth/login\`: Login an existing user.
    -   \`GET /api/v1/auth/me\`: Get current authenticated user's profile (requires JWT).
-   **Health Check:**
    -   \`GET /health\`: Check backend health status.

## Development Plan (Phased Approach)

This outlines the planned development stages for the backend.

### Phase 1: Core Infrastructure and User Management
*   **Status:** In Progress / Partially Complete
1.  *Setup Basic Express Server:* Implement server setup in \`server.ts\` and \`app.ts\` with essential middlewares and error handling. (COMPLETED)
2.  *Configuration Management:* Implement configuration loading in \`config/index.ts\` using \`dotenv\`. (COMPLETED)
3.  *Database Connectivity:* Implement connection logic for TimescaleDB (\`database/timescaledb.ts\`) and MongoDB (\`database/mongodb.ts\`). (COMPLETED)
4.  *User Model & Authentication:* Define User schema (\`models/mongodb/user.model.ts\`), implement registration/login (\`auth/auth.service.ts\`, \`auth/auth.controller.ts\`) with bcrypt and JWT. Implement JWT middleware (\`middlewares/auth.middleware.ts\`). (COMPLETED)
5.  *Basic User Routes:* Setup routes in \`auth/auth.routes.ts\` for \`/register\`, \`/login\`, and a protected \`/profile\` route. (COMPLETED)
6.  *Create Backend README.md:* This document. (COMPLETED)

### Phase 2: Exchange Integration and Core Trading Logic
*   **Status:** TODO
1.  *Exchange Configuration Model:* Define schema/table for \`exchange_configs\`.
2.  *Secure API Key Management:* Services for adding/removing encrypted API keys.
3.  *CCXT Integration Service:* \`trading/exchange.service.ts\` for CCXT methods.
4.  *Wallet Management:* \`trading/wallet.controller.ts\` & service.
5.  *Basic Trading Routes:* Endpoints for symbols, tickers, orders.

### Phase 3: Kafka Integration & Real-time Data Processing
*   **Status:** TODO
1.  *Kafka Setup:* Producer/consumer setup (\`kafka/index.ts\`).
2.  *WebSocket Data Ingestion:* WebSocket clients in \`websocket/\` producing to Kafka.
3.  *Data Persistence Consumers:* Kafka consumers in \`kafka/consumers/\` storing to TimescaleDB.
4.  *Redis Caching:* Implement Redis connection and caching.

### Phase 4: Strategy Engine & Oracle
*   **Status:** TODO
1.  *Strategy Configuration Model:* Define \`strategies_config\`.
2.  *Strategy Engine Service:* \`strategy-engine/engine.service.ts\`.
3.  *Oracle Processor:* \`oracle/oracle.service.ts\`.
4.  *Signal Consumption & Order Execution:* Service to consume signals and execute trades.

### Phase 5: E-commerce, Referrals, and Support
*   **Status:** TODO
1.  *E-commerce:* Models and services in \`store/\`.
2.  *Referral System:* Models and services in \`referrals/\`.
3.  *Support Ticket System:* Models and services in \`support/\`.

### Phase 6: Marketplace & Sandbox Integration
*   **Status:** TODO
1.  *Marketplace Script Model:* Define \`marketplace_scripts\`.
2.  *Marketplace Service:* \`marketplace/marketplace.service.ts\`.
3.  *Sandbox Execution Service:* \`sandbox/sandbox.service.ts\` & \`dockerExecutor.utils.ts\`.
4.  *Script Runner Service:* \`marketplace/scriptRunner.service.ts\`.

### Phase 7: Advanced Features & Polish
*   **Status:** TODO
1.  *Web3 & DeFi Integration:* \`web3/\`.
2.  *Risk Management:* \`risk/\`.
3.  *Analytics & Reporting:* \`analytics/\`.
4.  *Notifications:* \`notifications/\`.
5.  *Admin Panel Functionality*.
6.  *Logging & Monitoring Enhancements*.
7.  *API Documentation (Swagger/OpenAPI)*.

## Key Components Overview

-   **`app.ts`**: Configures the Express application, loads global middlewares, and sets up global error handling.
-   **`server.ts`**: Initializes the HTTP server, manages database connections, and handles graceful shutdown.
-   **`config/`**: Manages all environment configurations and service-specific settings (DB, Kafka, Redis).
-   **`auth/`**: Handles all aspects of user authentication (registration, login, JWT generation) and authorization (role-based access control).
-   **`database/`**: Contains the logic for connecting to and interacting with TimescaleDB and MongoDB.
-   **`models/`**: Defines data schemas, primarily Mongoose models for MongoDB.
-   **`routes/`**: Defines the API endpoints and maps them to controller functions.
-   **`controllers/`**: Receives HTTP requests, validates input (or uses validation middleware), calls appropriate services, and sends HTTP responses.
-   **`services/`**: Contains the core business logic of the application, interacting with database models and other services.
-   **`middlewares/`**: Provides reusable functions for request processing, such as authentication checks, input validation, logging, etc.
-   **`trading/`**: Will house logic related to CCXT library integration, fetching market data, placing orders, and managing exchange interactions.
-   **`kafka/` & `websocket/`**: Will manage real-time data pipelines from exchanges to the system.
-   **`marketplace/` & `sandbox/`**: Will manage the trading script marketplace and secure execution of these scripts.

## Contributing

(Details to be added later. For now, focus on understanding the existing structure and planned phases.)

## License

(To be determined and added later.)

EOL
