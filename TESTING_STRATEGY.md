# Backend Testing Strategy

This document outlines the strategy and approach for testing the backend of the Crypto Trading Bot platform. The goal is to ensure code quality, reliability, and maintainability through a combination of unit, integration, and API tests.

## Table of Contents

1.  [Recommended Testing Stack](#1-recommended-testing-stack)
2.  [General Testing Principles](#2-general-testing-principles)
    *   [Test Types](#test-types)
    *   [Test Structure & Naming](#test-structure--naming)
    *   [Arrange-Act-Assert (AAA) Pattern](#arrange-act-assert-aaa-pattern)
    *   [Mocking and Stubbing](#mocking-and-stubbing)
    *   [Test Data Management](#test-data-management)
    *   [Code Coverage](#code-coverage)
3.  [Phased Testing Plan](#3-phased-testing-plan)
    *   [Phase T0: Setup & Basic API Tests](#phase-t0-setup--basic-api-tests)
    *   [Phase T1: Core Infrastructure & Authentication](#phase-t1-core-infrastructure--authentication)
    *   [Phase T2: Exchange Integration & Core Trading Logic](#phase-t2-exchange-integration--core-trading-logic)
    *   [Phase T3: Kafka & Real-time Data Processing](#phase-t3-kafka--real-time-data-processing)
    *   [Phase T4: Strategy Engine & Oracle](#phase-t4-strategy-engine--oracle)
    *   [Phase T5: E-commerce, Referrals, and Support](#phase-t5-e-commerce-referrals-and-support)
    *   [Phase T6: Marketplace & Sandbox Integration](#phase-t6-marketplace--sandbox-integration)
    *   [Phase T7: Advanced Features & Polish](#phase-t7-advanced-features--polish)
4.  [Running Tests](#4-running-tests)
5.  [Continuous Integration (CI) Considerations](#5-continuous-integration-ci-considerations)

---

## 1. Recommended Testing Stack

For the Node.js/TypeScript backend, the following testing stack is recommended for its effectiveness and ease of use within the ecosystem:

*   **Test Runner & Assertion Library**:
    *   **Jest**: A comprehensive testing framework that includes a test runner, assertion library (e.g., `expect`), and powerful mocking capabilities. It's well-suited for both unit and integration tests and offers features like snapshot testing and code coverage out of the box.
    *   `ts-jest`: A Jest transformer to allow tests to be written in TypeScript.
*   **API Integration Testing**:
    *   **Supertest**: For testing HTTP APIs by making requests directly to the Express application without needing to run the server on a live port. This makes API tests faster and more reliable.
*   **In-Memory Databases (for faster, isolated tests)**:
    *   **`mongodb-memory-server`**: Allows running MongoDB-dependent tests (models, services) against an in-memory MongoDB instance, ensuring test isolation and speed.
    *   **`pg-mem`**: Provides an in-memory PostgreSQL instance, suitable for testing services that interact with TimescaleDB (as TimescaleDB is an extension of PostgreSQL). Note that TimescaleDB-specific features (like hypertables or time-series functions) might not be fully supported or behave identically, so some tests might still require a real test database instance.
*   **Mocking External Dependencies**:
    *   **Jest Mocks**: Jest's built-in mocking (`jest.fn()`, `jest.mock()`, `jest.spyOn()`) is generally sufficient for most mocking needs.
    *   **Specific Mocks**:
        *   **CCXT**: For services using the CCXT library, mock its methods to return predefined responses, simulating various exchange behaviors without making real API calls.
        *   **Nodemailer**: Mock the `transporter.sendMail` method to verify email sending logic without actually sending emails.
        *   **KafkaJS**: Mock Kafka producer's `send` method and consumer's `run/eachMessage` logic for unit testing components interacting with Kafka. For integration, consider specialized Kafka testing libraries or testing against a local Dockerized Kafka instance.

---

## 2. General Testing Principles

*   ### Test Types
    *   **Unit Tests**: Focus on testing the smallest units of code in isolation (e.g., individual functions, methods within a service, utility functions). Dependencies should be mocked.
    *   **Integration Tests**: Test the interaction between multiple components or modules.
        *   *Service-Level*: Test service methods interacting with their database models (using in-memory databases).
        *   *API/Route-Level*: Test API endpoints using Supertest, verifying the flow from request through controller and service layers, potentially to an in-memory database.
    *   **End-to-End (E2E) Tests**: While the Postman collection serves as a form of E2E testing, automated E2E tests (e.g., using Puppeteer, Cypress, or Playwright) could be considered for critical user flows if a frontend exists. For backend-only, API integration tests with Supertest cover a large part of this.

*   ### Test Structure & Naming
    *   **Co-location**: Place test files within a `__tests__` subdirectory alongside the code they are testing (e.g., `src/auth/__tests__/auth.service.test.ts`).
    *   **Naming Convention**: Use `.test.ts` or `.spec.ts` suffix for test files.
    *   **Descriptive Names**: Test suites (`describe` blocks) and test cases (`it` or `test` blocks) should have clear, descriptive names outlining what they are testing.

*   ### Arrange-Act-Assert (AAA) Pattern
    Structure tests using the AAA pattern:
    1.  **Arrange**: Set up the test conditions, including initializing variables, creating mock data, and setting up mocks/stubs.
    2.  **Act**: Execute the code being tested (e.g., call a function or method).
    3.  **Assert**: Verify that the actual outcome matches the expected outcome using assertions (e.g., `expect(result).toBe(true)`).

*   ### Mocking and Stubbing
    *   Mock external dependencies (databases, external APIs, other services not under test) in unit tests to ensure isolation and predictability.
    *   Use Jest's mocking features extensively.
    *   For integration tests, selectively mock parts that are outside the scope of the integration being tested (e.g., mock Nodemailer in an API test that triggers an email).

*   ### Test Data Management
    *   Use factory functions or fixtures to generate consistent test data.
    *   Ensure in-memory databases are cleaned up before/after each test or test suite to maintain test isolation. `mongodb-memory-server` and `pg-mem` usually handle this well.

*   ### Code Coverage
    *   Aim for a reasonable level of code coverage (e.g., >80%) as a guideline, but focus on testing critical paths and complex logic rather than just chasing a percentage.
    *   Use Jest's built-in coverage reporting (`jest --coverage`).

---

## 3. Phased Testing Plan

This plan outlines how tests can be progressively added, ideally in parallel with or shortly after feature development.

### Phase T0: Setup & Basic API Tests
*   **Objective**: Establish the testing environment and write initial high-level API tests.
*   **Tasks**:
    1.  Install Jest, `ts-jest`, Supertest, `mongodb-memory-server`, `pg-mem`.
    2.  Configure Jest (`jest.config.js`).
    3.  Add test scripts to `package.json`.
    4.  Write a basic API integration test for the `/health` endpoint using Supertest.
    5.  Set up helper functions for database connections (to in-memory instances) for test suites.

### Phase T1: Core Infrastructure & Authentication
*   **Targets**: `AuthService`, `UserService` (admin part), `auth.routes.ts`, `userManagement.routes.ts`, `encryption.utils.ts`.
*   **Unit Tests**:
    *   `encryption.utils.ts`: Test `encrypt` and `decrypt` functions.
    *   `AuthService`: Test `register` (mock User model, check password hashing, JWT signing call), `login` (mock User model, password comparison, JWT signing).
    *   `UserService`: Test user listing, updating logic (mock User model).
*   **Integration Tests (API)**:
    *   Use Supertest for `/auth/register`, `/auth/login`, `/auth/me`.
    *   Test `/admin/users/*` routes for listing, getting, updating users (with admin auth).
    *   Verify request validation, success responses, error responses, and authentication/authorization.
    *   Use `mongodb-memory-server` for these tests.

### Phase T2: Exchange Integration & Core Trading Logic
*   **Targets**: `ExchangeConfigService`, `ExchangeService`, `exchangeConfig.routes.ts`, `wallet.routes.ts`, `marketData.routes.ts`.
*   **Unit Tests**:
    *   `ExchangeConfigService`: Test CRUD operations, mocking `ExchangeConfig` model and `EncryptionUtils`.
    *   `ExchangeService`: Test methods like `fetchBalance`, `fetchTicker`, `createOrder`. **Crucially, mock the CCXT library** to simulate exchange responses (success, errors, different data). Test instance caching logic.
*   **Integration Tests (API)**:
    *   Supertest for `/trading/exchange-configs/*`, `/trading/wallets/*`, `/trading/market-data/*` routes.
    *   Verify correct interaction with services and data transformation.
    *   Use `mongodb-memory-server` for `ExchangeConfig` data.

### Phase T3: Kafka & Real-time Data Processing
*   **Targets**: `MarketDataFeedService`, Kafka consumers (`marketDataOrderbook.consumer.ts`, etc.), Kafka setup (`kafka/index.ts`).
*   **Unit Tests**:
    *   `MarketDataFeedService`: Test logic for adding/removing watched symbols, topic name generation. Mock `ccxt.pro` to simulate WebSocket messages and verify that the service attempts to produce correct messages to Kafka (mock Kafka producer). Test reconnection/error handling logic for WS connections.
    *   Kafka Consumers: Unit test the `messageHandler` function of each consumer by providing mock Kafka messages. Mock `pgQuery` and Redis client methods to verify data transformation and DB/cache interaction logic.
*   **Integration Tests**:
    *   This is more complex. Could involve:
        *   Testing `MarketDataFeedService` producing to a test Kafka instance (e.g., Dockerized Kafka) and a separate test consumer verifying messages.
        *   Testing consumers consuming from a test Kafka instance and writing to in-memory `pg-mem` and Redis (if a test Redis instance is used).
    *   *Initial Focus*: Prioritize unit tests for consumer message handlers and `MarketDataFeedService` logic due to integration complexity.

### Phase T4: Strategy Engine & Oracle
*   **Targets**: `StrategyConfigService`, `StrategyEngineService`, `OracleProcessorService`, `OrderExecutionService`, `strategyConfig.routes.ts`.
*   **Unit Tests**:
    *   `StrategyConfigService`: Test CRUD for strategy configurations (mock `StrategyConfig` model).
    *   `StrategyEngineService`: Test `loadAndManageStrategies`, `startStrategyInstance`, `stopStrategyInstance`. For `evaluateStrategy`, mock market data input (from Redis mock) and test placeholder signal generation logic. Mock Kafka producer for signal sending.
    *   `OracleProcessorService`: Test `evaluateMonitoredMarkets`. Mock Redis client, provide sample order book data, verify imbalance calculation and Kafka message production (mock producer).
    *   `OrderExecutionService`: Unit test `messageHandler`. Mock incoming signals. Mock `RiskManagementService`, `ExchangeService` (for order placement), `StrategyConfigService` (for status updates), and `pgQuery` (for DB logging).
*   **Integration Tests (API)**:
    *   Supertest for `/trading/strategy-configs/*` routes.
    *   Use `mongodb-memory-server`.

### Phase T5: E-commerce, Referrals, and Support
*   **Targets**: `ProductService`, `OrderService`, `ReferralService`, `SupportTicketService`, and their respective API routes.
*   **Unit Tests**:
    *   Test complex service logic, e.g., `OrderService.create` (stock deduction, total calculation), `ReferralService.processOrderForCommissions` (multi-level commission logic), `SupportTicketService.addReply` (status change logic). Mock relevant Mongoose models.
*   **Integration Tests (API)**:
    *   Supertest for all API routes in `/store/*`, `/referrals/*`, `/support-tickets/*`.
    *   Verify CRUD operations, user-specific access, admin access.
    *   Use `mongodb-memory-server`.

### Phase T6: Marketplace & Sandbox Integration
*   **Targets**: `MarketplaceService`, `SandboxExecutionService`, `ScriptRunnerService`, and their API routes.
*   **Unit Tests**:
    *   `MarketplaceService`: Test script submission, approval flow, listing logic (mock `MarketplaceScript` model).
    *   `SandboxExecutionService`: Test `executeScript` method. **Mock `dockerExecutor.utils.ts`** to simulate Docker execution results (stdout, stderr, exit codes, errors, timeouts) without actual Docker runs.
    *   `ScriptRunnerService`: Test `runScript` logic. Mock `MarketplaceService` (to provide script data) and `SandboxExecutionService` (to provide execution results).
*   **Integration Tests (API)**:
    *   Supertest for `/marketplace/*` routes (script management, listing).
    *   Supertest for `/marketplace/scripts/:idOrSlug/execute` route, verifying interaction with `ScriptRunnerService`.
    *   *Note*: Full integration testing of Docker execution is an E2E/manual concern or requires a dedicated Docker-in-Docker test environment.

### Phase T7: Advanced Features & Polish
*   **Targets**: `Web3Service`, `RiskManagementService` (if actual logic is added), `AnalyticsService`, `NotificationService`.
*   **Unit Tests**:
    *   `Web3Service`: Mock `ethers.JsonRpcProvider` and `solanaWeb3.Connection` to test methods like `getEthBalance`, `getSolanaBalance` without real network calls.
    *   `RiskManagementService`: If actual risk logic is implemented, unit test it thoroughly.
    *   `AnalyticsService`: Test `calculateUserPnl` with various transaction scenarios (mock `pgQuery`).
    *   `NotificationService`: Test `sendEmail` and specific notification methods. Mock `nodemailer.createTransport` and `transporter.sendMail` to verify email construction and sending logic without actual email dispatch.
*   **Integration Tests (API)**:
    *   Supertest for `/analytics/pnl` and any new admin/Web3 API endpoints.

---

## 4. Running Tests

Test execution will be managed via npm scripts in `backend/package.json`, for example:

*   `npm test`: Run all tests.
*   `npm run test:watch`: Run tests in watch mode for TDD.
*   `npm run test:coverage`: Run tests and generate a code coverage report.
*   `npm run test:unit`: (Optional) Script to run only unit tests.
*   `npm run test:integration`: (Optional) Script to run only integration tests.

---

## 5. Continuous Integration (CI) Considerations

*   Integrate test execution (`npm test`) into the CI/CD pipeline (e.g., GitHub Actions, GitLab CI).
*   Ensure the CI environment can support the test requirements (Node.js, Docker if needed for specific integration tests not using in-memory alternatives).
*   Consider running linters and code formatters as part of the CI pipeline.
*   Track code coverage over time.

---

This testing strategy provides a roadmap for building a comprehensive test suite, ensuring the backend's stability and correctness as it evolves.
