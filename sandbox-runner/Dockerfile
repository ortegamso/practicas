# Base image (e.g., Ubuntu)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install common dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    sudo \
    # Add other common utilities if needed
    && rm -rf /var/lib/apt/lists/*

# --- Python ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN python3 -m pip install --upgrade pip

# --- Node.js ---
# Install Node.js (e.g., LTS version) using NodeSource repository
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
RUN apt-get update && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g npm@latest # Update npm to the latest version

# --- PHP ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    php-cli \
    php-json \
    php-curl \
    # Add other common PHP extensions if needed: php-mbstring, php-xml, etc.
    && rm -rf /var/lib/apt/lists/*

# --- Java (OpenJDK) ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk \
    # openjdk-11-jdk # Or other versions
    && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 # Adjust if version changes

# --- C++ (GCC) ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    make \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# --- Rust ---
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:\${PATH}"
# RUN rustup default stable # Or nightly, etc.

# --- Solidity (solc) ---
# This might be more complex as solc versions are important.
# Consider installing solc-select or specific versions as needed.
# For a basic setup, you might install a recent version via PPA or binary.
# Example for a specific version (adjust as needed):
# RUN apt-get update && apt-get install -y software-properties-common && add-apt-repository ppa:ethereum/ethereum
# RUN apt-get update && apt-get install -y solc

# Create a non-root user for script execution
RUN useradd -ms /bin/bash sandboxuser
# Allow sandboxuser to run specific commands with sudo if absolutely necessary,
# but ideally, scripts should not require sudo.
# RUN echo "sandboxuser ALL=(ALL) NOPASSWD: /path/to/specific/command" >> /etc/sudoers

# --- Runner Script ---
# The runner.sh script will be responsible for taking a script,
# its language, and data, then executing it and capturing output.
COPY runner.sh /usr/local/bin/runner.sh
RUN chmod +x /usr/local/bin/runner.sh

# Set up a working directory for script execution
WORKDIR /sandbox
RUN mkdir /sandbox/scripts_to_run
RUN chown -R sandboxuser:sandboxuser /sandbox
# Scripts will be copied into /sandbox/scripts_to_run by the backend orchestrator

# Default user for execution
USER sandboxuser

# The CMD or ENTRYPOINT will likely be overridden by the Docker execution command from backend,
# but a default can be set for testing the image.
# For example, to just keep the container running for exec:
# CMD ["tail", "-f", "/dev/null"]
# Or to run the runner script with default args (if that makes sense):
# ENTRYPOINT ["/usr/local/bin/runner.sh"]
CMD ["/bin/bash"] # Keep container running for exec or debugging
