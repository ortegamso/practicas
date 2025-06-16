# Use an official Node.js runtime as a parent image
FROM node:18-alpine AS development

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Transpile TypeScript to JavaScript
RUN npm run build # Assumes you have a "build" script in package.json (e.g., tsc)

# Production stage
FROM node:18-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production # Install only production dependencies

COPY --from=development /usr/src/app/dist ./dist

# Expose the port the app runs on
EXPOSE ${PORT:-4000}

# Command to run the application
CMD ["node", "dist/server.js"]
