# Understanding Environment Variables (.env.example, .env, .secrets.env)

## Purpose

Environment variables are crucial for configuring the application across different environments (development, testing, production) without hardcoding sensitive information or settings directly into the codebase. This project uses a common pattern involving several \`.env\`-related files:

*   **\`.env.example\`**:
    *   **Purpose**: This file serves as a template or blueprint listing all the environment variables required by the application(s) (backend, frontend, etc.).
    *   **Content**: It contains placeholder or example values.
    *   **Version Control**: **It IS and SHOULD BE committed to version control** (e.g., Git). This allows new developers to quickly see what variables are needed.
    *   **Usage**: Developers should copy this file to \`.env\` and fill in their actual values for their local development environment.

*   **\`.env\`**:
    *   **Purpose**: This is where individual developers store their actual local configuration values.
    *   **Content**: Contains real values for variables listed in \`.env.example\`.
    *   **Version Control**: **It SHOULD NOT be committed to version control.** It's typically listed in \`.gitignore\`.
    *   **Loading**: The backend application (specifically \`src/config/index.ts\`) is configured to load variables from this file using the \`dotenv\` library.

*   **\`.env.<NODE_ENV>\` (e.g., \`.env.development\`, \`.env.test\`)**:
    *   **Purpose**: Allows for environment-specific overrides that can be committed to version control if they are not sensitive (e.g., different API base URLs for development vs. test).
    *   **Content**: Contains variables specific to that environment.
    *   **Version Control**: Can be committed if non-sensitive.
    *   **Loading**: Loaded by \`src/config/index.ts\` based on the \`NODE_ENV\` value, overriding values from \`.env\`.

*   **\`.secrets.env\`**:
    *   **Purpose**: To store highly sensitive information like production database passwords, API keys for third-party services, and JWT secrets, especially for local development when these secrets are needed but should not be in \`.env\` if \`.env\` is ever accidentally committed or shared.
    *   **Content**: Contains actual secret values.
    *   **Version Control**: **It SHOULD NOT be committed to version control** (and is listed in \`.gitignore\`).
    *   **Loading**: Loaded by \`src/config/index.ts\` *after* other \`.env\` files, allowing it to override any previously set values. Also loaded by \`docker-compose.yml\` directly into services.

## Loading Precedence

The backend configuration loader (\`src/config/index.ts\`) loads these files in a specific order, where later files override earlier ones:
1.  **\`.env\`** (for general local defaults)
2.  **\`.env.<NODE_ENV>\`** (e.g., \`.env.development\` for specific development overrides) - Not loaded in `production` by default in the current setup, expecting production env vars to be set directly.
3.  **\`.secrets.env\`** (for all sensitive data, takes highest precedence among files)

In **production environments**, it's standard practice to inject environment variables directly into the runtime environment (e.g., via Docker environment settings, Kubernetes secrets, PaaS configuration) rather than relying on \`.env\` files on the server.

## Variables Defined in \`.env.example\`

This section details the variables found in the root \`.env.example\` file.

---

### Backend Configuration

*   **`NODE_ENV`**
    *   **Purpose**: Specifies the application environment. Affects logging, error handling, and potentially other behaviors.
    *   **Example**: \`development\`, \`production\`, \`test\`
    *   **Default in \`.env.example\`**: \`development\`

*   **`PORT`**
    *   **Purpose**: The port on which the backend server will listen.
    *   **Example**: \`4000\`
    *   **Default in \`.env.example\`**: \`4000\`

*   **`API_BASE_URL`**
    *   **Purpose**: The base URL for the API, primarily used by the frontend or other clients to construct request URLs.
    *   **Example**: \`http://localhost:4000/api/v1\` (for local dev)
    *   **Default in \`.env.example\`**: \`http://localhost:4000/api\` (Note: \`/v1\` is often appended in \`app.ts\`)

---

### Frontend Configuration

These variables are typically prefixed with \`NEXT_PUBLIC_\` if using Next.js, making them available in the browser-side JavaScript bundle.

*   **`NEXT_PUBLIC_API_URL`**
    *   **Purpose**: The full base URL of the backend API that the frontend will communicate with.
    *   **Example**: \`http://localhost:4000/api/v1\`
    *   **Default in \`.env.example\`**: \`http://localhost:4000/api\`

*   **`NEXT_PUBLIC_WEBSITE_NAME`**
    *   **Purpose**: The display name for the website/platform, usable in titles, headers, etc.
    *   **Example**: \`"Crypto Trading Platform"\`
    *   **Default in \`.env.example\`**: \`"Crypto Trading Platform"\`

---

### Database - TimescaleDB/PostgreSQL

Variables for connecting to the TimescaleDB (PostgreSQL) instance.

*   **`POSTGRES_HOST`**
    *   **Purpose**: Hostname or IP address of the PostgreSQL server.
    *   **Example**: \`timescaledb\` (if running in Docker Compose network), \`localhost\` (if running locally outside Docker).
    *   **Default in \`.env.example\`**: \`timescaledb\`

*   **`POSTGRES_PORT`**
    *   **Purpose**: Port number for the PostgreSQL server.
    *   **Example**: \`5432\`
    *   **Default in \`.env.example\`**: \`5432\`

*   **`POSTGRES_DB`**
    *   **Purpose**: Name of the database to connect to.
    *   **Example**: \`crypto_trading_db\`
    *   **Default in \`.env.example\`**: \`crypto_trading_db\`

*   **`POSTGRES_USER`**
    *   **Purpose**: Username for connecting to the PostgreSQL database.
    *   **Example**: \`user\`
    *   **Default in \`.env.example\`**: \`user\`

*   **`POSTGRES_PASSWORD`**
    *   **Purpose**: Password for the PostgreSQL user. **This is sensitive.**
    *   **Example**: \`password\` (for development only)
    *   **Default in \`.env.example\`**: \`password\`
    *   **Recommendation**: For actual development or any shared environment, set this in \`.secrets.env\` or use runtime environment variables.

---

### Database - MongoDB

Variables for connecting to the MongoDB instance.

*   **`MONGO_HOST`**
    *   **Purpose**: Hostname or IP address of the MongoDB server.
    *   **Example**: \`mongodb\` (Docker Compose), \`localhost\`.
    *   **Default in \`.env.example\`**: \`mongodb\`

*   **`MONGO_PORT`**
    *   **Purpose**: Port number for the MongoDB server.
    *   **Example**: \`27017\`
    *   **Default in \`.env.example\`**: \`27017\`

*   **`MONGO_DATABASE`**
    *   **Purpose**: Name of the MongoDB database to use.
    *   **Example**: \`ecommerce_db\`
    *   **Default in \`.env.example\`**: \`ecommerce_db\`

*   **`MONGO_USER`**
    *   **Purpose**: Username for MongoDB authentication (optional for local dev if auth is not strictly enforced, but required for production or specific auth mechanisms).
    *   **Example**: \`root\` (for development if using root user)
    *   **Default in \`.env.example\`**: \`root\`
    *   **Recommendation**: Use a dedicated application user in production.

*   **`MONGO_PASSWORD`**
    *   **Purpose**: Password for the MongoDB user. **This is sensitive.**
    *   **Example**: \`secret\` (for development only)
    *   **Default in \`.env.example\`**: \`secret\`
    *   **Recommendation**: Set this in \`.secrets.env\` or use runtime environment variables.

*   **`MONGO_URI`** (Optional)
    *   **Purpose**: A full MongoDB connection string. If provided, it typically overrides individual host, port, user, pass, db settings.
    *   **Example**: \`mongodb://user:pass@host:port/db?authSource=admin\`
    *   **Default in \`.env.example\`**: Not explicitly set, but the backend config (\`src/config/index.ts\`) can construct one if this is missing.

---

### Kafka

Variables for connecting to Apache Kafka brokers.

*   **`KAFKA_BROKERS`**
    *   **Purpose**: A comma-separated list of Kafka broker addresses (host:port).
    *   **Example**: \`kafka:29092\` (for internal Docker network), \`localhost:9092\` (if accessing from host).
    *   **Default in \`.env.example\`**: \`kafka:29092\`

*   **`KAFKA_CLIENT_ID`**
    *   **Purpose**: An optional logical identifier for the Kafka client connecting from this application instance.
    *   **Example**: \`my-app-backend\`
    *   **Default in \`.env.example\`**: \`my-app\`

*   **`KAFKA_GROUP_ID`**
    *   **Purpose**: The default consumer group ID for Kafka consumers in this application. Specific consumers might override this.
    *   **Example**: \`trading-platform-group\`
    *   **Default in \`.env.example\`**: \`my-group\`

---

### Redis

Variables for connecting to the Redis cache.

*   **`REDIS_HOST`**
    *   **Purpose**: Hostname or IP address of the Redis server.
    *   **Example**: \`redis\` (Docker Compose), \`localhost\`.
    *   **Default in \`.env.example\`**: \`redis\`

*   **`REDIS_PORT`**
    *   **Purpose**: Port number for the Redis server.
    *   **Example**: \`6379\`
    *   **Default in \`.env.example\`**: \`6379\`

*   **`REDIS_PASSWORD`** (Optional)
    *   **Purpose**: Password for Redis authentication, if enabled on the Redis server.
    *   **Example**: \`your_redis_password\`
    *   **Default in \`.env.example\`**: Commented out or empty (assuming no password for local dev by default).
    *   **Recommendation**: If used, set in \`.secrets.env\`.

---

### JWT Configuration (Authentication)

Variables for JSON Web Token settings.

*   **`JWT_SECRET`**
    *   **Purpose**: A long, strong, random secret key used to sign and verify JWTs. **This is highly sensitive and critical for security.**
    *   **Example**: \`your_jwt_secret_key_here_min_32_chars\` (This is just a placeholder format!)
    *   **Default in \`.env.example\`**: \`your_jwt_secret_key_here_min_32_chars\`
    *   **Action Required**: **Generate a strong, unique secret for this** (e.g., using a password manager or \`openssl rand -hex 32\`) and store it in \`.secrets.env\` or as a runtime environment variable. Do not use the example value.

*   **`JWT_EXPIRES_IN`**
    *   **Purpose**: Defines the lifetime of a JWT (e.g., "1d" for one day, "7h" for seven hours, "3600s" for one hour).
    *   **Example**: \`1d\`
    *   **Default in \`.env.example\`**: \`1d\`

---

### Exchange API Keys (Examples)

These are placeholders for API keys from cryptocurrency exchanges. **These are highly sensitive.**

*   **`BINANCE_API_KEY`**, **`BINANCE_API_SECRET`**
*   **`BYBIT_API_KEY`**, **`BYBIT_API_SECRET`**
    *   **Purpose**: Credentials for accessing user accounts on exchanges via their APIs.
    *   **Action Required**: Users will add their actual API keys through the application's UI, which will then be encrypted and stored by the backend. These \`.env.example\` entries are primarily for awareness or if direct backend testing with specific keys is needed (in which case they must go into \`.secrets.env\`).
    *   **Default in \`.env.example\`**: Placeholder values like \`your_binance_api_key\`.

---

### Web3 Configuration

Variables for connecting to blockchain RPC endpoints.

*   **`ETHEREUM_RPC_URL`**
    *   **Purpose**: The URL of an Ethereum JSON-RPC endpoint (e.g., Infura, Alchemy, or a self-hosted node).
    *   **Example**: \`https://mainnet.infura.io/v3/your_infura_project_id\`
    *   **Default in \`.env.example\`**: Example Infura URL.
    *   **Action Required**: Replace \`your_infura_project_id\` with your actual project ID if using Infura, or provide your own RPC URL.

*   **`SOLANA_RPC_URL`**
    *   **Purpose**: The URL of a Solana JSON-RPC endpoint.
    *   **Example**: \`https://api.mainnet-beta.solana.com\`
    *   **Default in \`.env.example\`**: Solana mainnet public RPC.

---

### Referral System

*   **`MAX_REFERRAL_LEVELS`**
    *   **Purpose**: Defines the maximum depth of the multi-level referral system.
    *   **Example**: \`3\`
    *   **Default in \`.env.example\`**: \`3\`

---

### Sandbox Configuration

*   **`SANDBOX_TIMEOUT_MS`**
    *   **Purpose**: Default timeout in milliseconds for script execution in the sandbox environment.
    *   **Example**: \`30000\` (30 seconds)
    *   **Default in \`.env.example\`**: \`30000\`

---

### Email SMTP Configuration (for Nodemailer)

Variables for configuring the email sending service.

*   **`SMTP_HOST`**: Hostname of your SMTP server.
*   **`SMTP_PORT`**: Port of your SMTP server (e.g., 587 for TLS, 465 for SSL).
*   **`SMTP_SECURE`**: \`true\` if using SSL (port 465), \`false\` for TLS/STARTTLS (port 587).
*   **`SMTP_USER`**: Username for SMTP authentication.
*   **`SMTP_PASS`**: Password for SMTP authentication. **Sensitive.**
*   **`EMAIL_FROM_ADDRESS`**: Default "from" email address for notifications.
*   **`EMAIL_FROM_NAME`**: Default "from" name for notifications.
    *   **Action Required**: Configure these with your actual SMTP provider details (e.g., SendGrid, Mailgun, Gmail for testing, or a local SMTP server like MailHog/Mailtrap for development). For services like Ethereal (testing), you might get credentials differently. Sensitive parts like `SMTP_PASS` should go into \`.secrets.env\`.
    *   **Default in \`.env.example\`**: Typically placeholders or commented out, as these are highly environment-specific. (The subtask added these to config; ensure they are in your actual \`.env.example\` if not already).

---

## Best Practices for Managing Environment Variables

1.  **Never commit sensitive data**: Files like \`.env\` or \`.secrets.env\` containing actual API keys, database passwords, or JWT secrets must **never** be committed to version control. Use \`.gitignore\` to prevent this.
2.  **Use \`.env.example\` as a template**: This file should list all necessary variables with placeholder or safe default values. New developers should copy it to \`.env\` and fill it out.
3.  **Prioritize Runtime Environment Variables in Production**: For production deployments, inject variables directly into the environment where the application runs (e.g., Docker container environment, PaaS settings, Kubernetes Secrets). Do not deploy \`.env\` files to production servers.
4.  **Least Privilege**: Ensure that API keys or database credentials have only the minimum necessary permissions for the application to function.
5.  **Regularly Rotate Secrets**: Change passwords, API keys, and JWT secrets periodically, especially if a compromise is suspected.
6.  **Use a Secrets Management System (for advanced/production setups)**: Tools like HashiCorp Vault, AWS Secrets Manager, or Google Cloud Secret Manager can provide more secure storage and access control for secrets.
