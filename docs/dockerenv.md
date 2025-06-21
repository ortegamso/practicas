# Understanding the .dockerenv File

## Purpose

The \`.dockerenv\` file is used to define environment variables that are specifically intended for the Docker Compose environment and the runtime of the Docker containers. These variables can:

-   Set or override values used within the \`docker-compose.yml\` file itself (e.g., image tags, service configurations if parameterized).
-   Provide environment variables directly to the services (containers) defined in \`docker-compose.yml\`.
-   Help in standardizing common settings across different services when running under Docker.

Variables in \`.dockerenv\` are typically loaded by Docker Compose when it starts up. They can be overridden by shell environment variables or variables defined directly in the \`environment\` section of a service in \`docker-compose.yml\` if not managed carefully (Docker Compose has a specific order of precedence).

Our \`docker-compose.yml\` is configured to load both \`.dockerenv\` and \`.secrets.env\` via the \`env_file\` directive for services like the backend, allowing a separation of Docker-specific runtime configurations and sensitive secrets.

## Variables Defined in \`.dockerenv\`

Below is an explanation of each variable typically found in our project's \`.dockerenv\` file:

---

### General Docker Compose Variables

*   **`COMPOSE_PROJECT_NAME`**
    *   **Purpose**: Sets a custom project name for Docker Compose. This name is used as a prefix for containers, networks, and volumes created by Compose.
    *   **Example**: \`crypto_trading_platform\`
    *   **Usage**: Helps in organizing and identifying Docker resources, especially if you run multiple Compose projects on the same host. If not set, Docker Compose typically uses the name of the directory containing the \`docker-compose.yml\` file.

---

### Backend Service Variables (\`backend\`)

These variables are passed to the backend Node.js application when it runs inside its Docker container.

*   **`NODE_ENV`**
    *   **Purpose**: Sets the Node.js environment mode for the backend application. This typically influences behavior such as logging levels, error detail, and optimizations.
    *   **Example**: \`development\` or \`production\`
    *   **Usage**: The backend application (e.g., via Express or custom logic in \`config/index.ts\`) reads this to adapt its behavior. For Docker, \`development\` is common for local setups, while a production deployment would override this to \`production\`.

*   **`PORT`**
    *   **Purpose**: Specifies the port number on which the backend Node.js application should listen for incoming HTTP requests *inside the container*.
    *   **Example**: \`4000\`
    *   **Usage**: The backend's \`server.ts\` reads this to start its HTTP server. The \`docker-compose.yml\` file then maps a host port to this container port (e.g., \`"4000:4000"\`).

---

### Database Services Variables

These variables are primarily used by the \`docker-compose.yml\` file to initialize the database services (TimescaleDB/PostgreSQL and MongoDB) and are also made available to other services (like the backend) that need to connect to these databases.

#### TimescaleDB / PostgreSQL (\`timescaledb\` service)

*   **`POSTGRES_DB`**
    *   **Purpose**: Specifies the name of the default database to be created when the PostgreSQL/TimescaleDB container starts for the first time.
    *   **Example**: \`crypto_trading_db\`
    *   **Usage**: Used by the official PostgreSQL Docker image during initialization. The backend service also uses this name (via its own configuration derived from environment variables) to connect to the correct database.

*   **`POSTGRES_USER`**
    *   **Purpose**: Specifies the username for the default superuser to be created in PostgreSQL/TimescaleDB.
    *   **Example**: \`user\`
    *   **Usage**: Used by the official PostgreSQL Docker image. The backend service uses this username for its database connections.

*   **`POSTGRES_PASSWORD`**
    *   **Purpose**: Sets the password for the \`POSTGRES_USER\`. **Important**: While this variable *can* be defined in \`.dockerenv\`, it's highly recommended to place the actual password in \`.secrets.env\` for security, as \`.dockerenv\` might be committed (if it doesn't contain secrets). Our setup loads both, with \`.secrets.env\` taking precedence.
    *   **Example**: (Should be in \`.secrets.env\`) \`supersecretdevpassword\`
    *   **Usage**: Used by PostgreSQL for user authentication and by the backend for connecting.

#### MongoDB (\`mongodb\` service)

*   **`MONGO_ROOT_USER`** (or `MONGO_INITDB_ROOT_USERNAME`)
    *   **Purpose**: Specifies the username for the root (administrative) user to be created in MongoDB when the container starts for the first time.
    *   **Example**: \`root\`
    *   **Usage**: Used by the official MongoDB Docker image during initialization of the \`admin\` database.

*   **`MONGO_ROOT_PASSWORD`** (or `MONGO_INITDB_ROOT_PASSWORD`)
    *   **Purpose**: Sets the password for the MongoDB root user. Like \`POSTGRES_PASSWORD\`, this should ideally be in \`.secrets.env\`.
    *   **Example**: (Should be in \`.secrets.env\`) \`supersecretmongodevpassword\`
    *   **Usage**: Used by MongoDB for root user authentication.

*   **`MONGO_DATABASE`** (or `MONGO_INITDB_DATABASE`)
    *   **Purpose**: Specifies the name of a database to be created automatically when the MongoDB container starts for the first time. If \`MONGO_INITDB_ROOT_USERNAME\` and \`MONGO_INITDB_ROOT_PASSWORD\` are set, this database will be created, and a user with these credentials will be created with access to this database.
    *   **Example**: \`ecommerce_db\`
    *   **Usage**: Useful for ensuring a specific application database exists from the start. The backend service connects to this database.

---

### Other Services (e.g., Kafka, Grafana)

*   Variables for other services like Kafka (e.g., advertised listeners, Zookeeper connection) or Grafana (admin user/password) can also be defined in \`.dockerenv\` if they are specific to the Docker runtime environment and not sensitive. However, many of these are often set directly in the \`environment\` section of the service in \`docker-compose.yml\` for clarity.

## How to Use

1.  **Copy \`.env.example\` to \`.dockerenv\`**: If a dedicated \`.dockerenv.example\` is not provided, you can often start by copying relevant parts from the main \`.env.example\` or creating \`.dockerenv\` from scratch.
2.  **Fill in Values**: Set the variables according to your local Docker setup needs.
3.  **Docker Compose Integration**: The \`docker-compose.yml\` file is typically configured to automatically load \`.dockerenv\` using the \`env_file\` directive within service definitions:
    \`\`\`yaml
    services:
      backend:
        env_file:
          - .dockerenv
          - .secrets.env # .secrets.env loaded after, so it can override .dockerenv if needed for secrets
    \`\`\`
4.  **Precedence**: Be aware of Docker Compose's environment variable precedence:
    1.  Compose file (\`environment\` block)
    2.  Shell environment variables
    3.  Environment file (\`env_file\` directive, like \`.dockerenv\`)
    4.  Dockerfile (\`ENV\` instruction)
    5.  Variables defined in \`.env\` at the root of the project (loaded by Compose CLI automatically).

By using \`.dockerenv\`, you can keep Docker-specific configurations separate and maintainable, especially when working in a team or across different environments. Remember to keep sensitive values like production passwords out of any committed \`.dockerenv\` file; use \`.secrets.env\` (which is gitignored) for those.
