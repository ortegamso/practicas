# Crypto Trading Bot & Marketplace

This project is a comprehensive platform for algorithmic cryptocurrency trading, featuring:

- **Multi-Exchange Trading Bot:** Focused on futures trading across Binance, Bybit, Bitmex, Huobi, and OKEx.
- **E-commerce Platform:** For selling bots, services, and promotional items, with a ticketing system for support.
- **Multi-Level Referral System:** Configurable up to 3 levels with adjustable percentage rewards.
- **Web3 & DeFi Integration:** For multi-network triangular arbitrage (Ethereum, Solana, etc.).
- **Algorithmic Trading Script Marketplace:** Users can publish, test (simulated/testnet), and run trading scripts.
- **Secure Sandbox Environment:** For executing scripts in various languages (Python, Node.js, PHP, C++, Java, Rust, Solidity).

## Architecture Overview

The system is designed to be modular, scalable, and secure, utilizing technologies such as:

- **Backend:** Node.js with Express and TypeScript
- **Frontend:** Next.js with React and Tailwind CSS
- **Databases:** TimescaleDB (for time-series data) and MongoDB (for flexible data)
- **Messaging:** Kafka for asynchronous communication
- **Caching:** Redis for low-latency data access
- **Orchestration:** Docker
- **Monitoring:** Grafana

## Backend Development Status

The backend development has progressed significantly:

-   **Core Infrastructure (Phase 1):** COMPLETED - Includes server setup, database connections, user authentication & JWT.
-   **Exchange Integration & Core Trading (Phase 2):** COMPLETED - CCXT integration for exchange interaction, API key management, balance retrieval, market data fetching (tickers, order books).
-   **Kafka & Real-time Data Processing (Phase 3):** COMPLETED - WebSocket data ingestion from exchanges, Kafka pipeline for market data (order books, trades, tickers), persistence to TimescaleDB, and Redis caching.
-   **Strategy Engine & Oracle (Phase 4):** COMPLETED - User strategy configuration API, foundational strategy engine (loads configs, placeholder evaluation, publishes signals to Kafka), basic oracle for market insights, and an order execution service consuming signals.
-   **E-commerce, Referrals & Support (Phase 5):** COMPLETED - Product & order management, multi-level referral system with commission tracking, and a support ticket system.
-   **Marketplace & Sandbox (Phase 6):** COMPLETED - Script marketplace model, service & API; sandbox execution service using Docker for isolated script runs; script runner service & API to test marketplace scripts.
-   **Advanced Features & Polish (Phase 7):** IN PROGRESS - Initial Web3 (ETH/SOL) connectivity, placeholder risk management service, basic analytics (PNL), notification service (email for welcome/trades), basic admin user management, and initial review for logging/monitoring enhancements. API documentation setup is pending.

The backend provides a robust foundation for trading operations, user script execution, and platform management.

### Testing Strategy

A comprehensive testing strategy has been defined for the backend to ensure its quality and reliability. This strategy outlines the recommended testing stack (Jest, Supertest, in-memory databases), general testing principles, and a phased approach for implementing unit and integration tests across all backend modules.

For detailed information, please refer to the [**Backend Testing Strategy document (`./TESTING_STRATEGY.md`)**](./TESTING_STRATEGY.md).

## Key Features (Planned)

- High-frequency trading capabilities for CeFi futures.
- Integrated e-commerce solution for products and services.
- Sophisticated multi-level referral program.
- DeFi arbitrage across multiple blockchain networks.
- A marketplace for users to share and monetize trading scripts.
- Secure execution environment for community-developed scripts.
- Advanced monitoring, robust security, structured logging, and automated documentation.

## Project Structure

```
/crypto-trading-bot
├── /backend        # Node.js backend application
├── /frontend       # Next.js frontend application
├── /scripts        # Database initialization and utility scripts
├── /docs           # Project documentation (e.g., API specs)
├── /sandbox-runner # Docker environment for running trading scripts
├── docker-compose.yml # Defines and configures all services
├── .env.example    # Example environment variables
├── .secrets.env    # Sensitive environment variables (gitignored)
├── .dockerenv      # Environment variables for Docker containers
├── .gitignore      # Specifies intentionally untracked files
└── README.md       # This file
```

## Getting Started

(Instructions to be added once the core components are further developed)

## Environment Configuration

Proper environment configuration is essential for running the application correctly in different setups (development, testing, production). This project utilizes \`.env\` files for managing environment variables, along with a specific file for Docker configurations.

### Key Configuration Files

*   **\`.env.example\`**: This is a template file committed to the repository. It lists all necessary environment variables with placeholder or example values. You should copy this to a \`.env\` file for your local setup.
    *   **Detailed Documentation**: [**Understanding .env.example and Environment Strategy (`./docs/env.example.md`)**](./docs/env.example.md)
*   **\`.env\`**: This file (which should be in your \`.gitignore\`) is where you store your actual local development variable values.
*   **\`.secrets.env\`**: For highly sensitive data (like production passwords or global API keys needed for local dev), also gitignored. Takes precedence over \`.env\` and \`.env.<NODE_ENV>\`.
*   **\`.env.<NODE_ENV>\`** (e.g., \`.env.development\`): For environment-specific overrides that are not sensitive and can be committed.
*   **\`.dockerenv\`**: Contains environment variables specifically for the Docker Compose environment and container runtime.
    *   **Detailed Documentation**: [**Understanding the .dockerenv File (`./docs/dockerenv.md`)**](./docs/dockerenv.md)

### Best Practices

-   **Never commit sensitive credentials**: Files like \`.env\` or \`.secrets.env\` containing actual API keys, database passwords, or JWT secrets must **never** be committed to version control.
-   **Use \`.env.example\` as the template**: All developers should start by copying \`.env.example\` to \`.env\` and then populating it with their local values.
-   **Prioritize runtime environment variables in production**: For production deployments, inject variables directly into the execution environment (e.g., Docker environment settings, Kubernetes Secrets, PaaS configuration) rather than deploying \`.env\` files.
-   **Principle of Least Privilege**: Ensure API keys and database credentials have only the minimum necessary permissions.
-   **Rotate secrets regularly**.

Please refer to the detailed markdown files linked above for an explanation of each specific variable.

## Contributing

(Guidelines for contributing to the project - TBD)

## License

(License information - TBD)
