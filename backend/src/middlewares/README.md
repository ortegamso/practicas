# Backend Middlewares (`backend/src/middlewares`)

## 1. Overview

Middleware functions are a cornerstone of Express.js applications. They are functions that have access to the request object (`req`), the response object (`res`), and the next middleware function in the application’s request-response cycle (`next`).

These functions can perform a wide variety of tasks:
- Execute any code.
- Make changes to the request and the response objects.
- End the request-response cycle.
- Call the next middleware in the stack.

This directory contains custom middleware functions developed for this application. Global middlewares (like `cors`, `helmet`, `morgan`, body parsers, global error handler) are configured directly in `src/app.ts`.

## 2. Existing Custom Middlewares

Currently, the primary custom middlewares are focused on authentication and authorization, located in `auth.middleware.ts`.

### File: `auth.middleware.ts`

This file contains middlewares crucial for securing routes and managing user access.

*   #### `protect`
    *   **Purpose**: Ensures that a route is accessible only by authenticated users.
    *   **Functionality**:
        1.  Extracts the JWT (JSON Web Token) from the `Authorization` header (expecting "Bearer <token>" format). It can be adapted to check cookies if needed.
        2.  If no token is found, it immediately responds with a `401 Unauthorized` error.
        3.  Verifies the token's validity using the `JWT_SECRET` (from environment configuration) and the `jsonwebtoken` library. This checks the signature and expiration.
        4.  If the token is invalid (e.g., malformed, wrong signature, expired), it responds with a `401 Unauthorized` error.
        5.  If the token is valid, it decodes the payload. The payload typically contains user identifiers like `id`, `username`, `email`, and `roles`.
        6.  This decoded user payload is then attached to the Express `req` object as `req.user`. This makes user information readily available to subsequent middlewares and route handlers.
        7.  Calls `next()` to pass control to the next function in the middleware stack.
    *   **Usage**: Applied to any route that requires a logged-in user.

*   #### `authorize(allowedRoles: UserRole[])` (Middleware Factory)
    *   **Purpose**: Provides Role-Based Access Control (RBAC) for specific routes, ensuring only users with certain roles can access them.
    *   **Functionality**:
        1.  This is a higher-order function that takes an array of `allowedRoles` (e.g., `[UserRole.ADMIN]`, `[UserRole.TRADER, UserRole.ADMIN]`) as an argument and returns an Express middleware function.
        2.  It **must** be used *after* the `protect` middleware, as it relies on `req.user` (and specifically `req.user.roles`) being populated.
        3.  Checks if `req.user` and `req.user.roles` exist. If not, it implies an issue with the `protect` middleware or its placement, and responds with `401 Unauthorized`.
        4.  Compares the roles present in `req.user.roles` against the `allowedRoles` passed to the factory.
        5.  If the user possesses at least one of the `allowedRoles`, it calls `next()` to grant access.
        6.  If the user does not possess any of the required roles, it responds with a `403 Forbidden` error.
    *   **Usage**: Used to protect routes that should only be accessible to users with specific privileges.
    *   **Specific Instances Exported**:
        *   `isAdmin = authorize([UserRole.ADMIN])`: Convenience middleware for routes accessible only by admins.
        *   `isTrader = authorize([UserRole.TRADER, UserRole.ADMIN])`: For trader functionalities, also accessible by admins.
        *   `isDeveloper = authorize([UserRole.DEVELOPER, UserRole.ADMIN])`: For developer-specific marketplace actions, also accessible by admins.

## 3. Global Middlewares (Configured in `src/app.ts`)

While not located in this directory, several global middlewares are configured in `src/app.ts` and are fundamental to the application's operation:

*   **`cors()`**: Enables Cross-Origin Resource Sharing, allowing requests from different origins (domains). Should be configured with specific allowed origins in production.
*   **`helmet()`**: Helps secure the app by setting various HTTP headers (e.g., X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options, X-XSS-Protection).
*   **`morgan('dev')`**: HTTP request logger. Logs requests to the console in a predefined format ('dev' for development, 'combined' or custom for production).
*   **`express.json()`**: Parses incoming requests with JSON payloads (populates `req.body`).
*   **`express.urlencoded({ extended: true })`**: Parses incoming requests with URL-encoded payloads (populates `req.body`).
*   **Not Found Handler (Custom in `app.ts`)**: Catches requests to undefined routes and forwards an error with a 404 status to the global error handler.
*   **Global Error Handler (Custom in `app.ts`)**: The final error-handling middleware. Catches errors passed via `next(error)` from any part of the application. It logs the error and sends a structured JSON error response to the client. The level of detail in the response (e.g., stack trace) can depend on the `NODE_ENV`.

## 4. Suggested Middlewares to Implement (Future Enhancements)

The following middlewares could be implemented to further enhance the application's functionality, security, and maintainability:

*   ### Advanced Input Validation Middleware
    *   **Purpose**: To rigorously validate request bodies (`req.body`), query parameters (`req.query`), and path parameters (`req.params`) against predefined schemas.
    *   **Libraries**: `Joi`, `express-validator`, or `Zod` are excellent choices.
    *   **Benefits**:
        *   Centralizes validation logic, keeping controllers cleaner and focused on business flow.
        *   Improves security by preventing malformed or malicious data from reaching service layers.
        *   Ensures data integrity early in the request lifecycle.
        *   Provides clear and consistent error messages for validation failures.
    *   **Implementation Sketch**:
        *   Define validation schemas for DTOs (Data Transfer Objects) or request inputs.
        *   Create a reusable middleware factory that accepts a schema.
        *   The middleware validates `req.body`, `req.query`, or `req.params` against the schema.
        *   If validation fails, it calls `next()` with an `AppError` (e.g., `HttpCode.BAD_REQUEST`) containing detailed validation messages. Otherwise, calls `next()`.
        *   Example usage: `router.post('/resource', validate(createResourceSchema), resourceController.create);`

*   ### Advanced Request Logging Middleware
    *   **Purpose**: To provide more detailed and structured logging for requests and responses than the default `morgan` setup, suitable for production environments and easier parsing by log management systems.
    *   **Libraries**: `Winston` (for structured logging) combined with a custom middleware.
    *   **Benefits**:
        *   Enhanced debugging capabilities with richer context per log entry.
        *   Improved auditing trails.
        *   Better performance monitoring by logging request duration, response sizes, etc.
        *   Facilitates integration with log aggregation and analysis tools (e.g., ELK stack, Splunk, Datadog).
    *   **Implementation Sketch**:
        *   The middleware would log: `timestamp`, `level`, `message` (e.g., "HTTP Request"), `method`, `url`, `status_code`, `content_length` (response), `response_time_ms`, `ip_address`, `user_agent`, `user_id` (if authenticated), `request_id` (trace ID).
        *   Log request body (sanitized for sensitive data) and response body (selectively).
        *   Integrate with a `Winston` logger instance configured with appropriate transports (console, file, external log service).

*   ### Granular Rate Limiting Middleware
    *   **Purpose**: The current `app.ts` has a commented-out basic global rate limiter. This would involve implementing more sophisticated and targeted rate limiting.
    *   **Library**: `express-rate-limit`.
    *   **Benefits**:
        *   Enhanced protection against brute-force attacks on login or sensitive endpoints.
        *   Prevents API abuse and ensures fair usage.
        *   Can be configured differently for various parts of the API (e.g., stricter limits on auth routes, more lenient on general data routes).
    *   **Implementation Sketch**:
        *   Configure multiple `express-rate-limit` instances with different options (windowMs, max requests, message, standard/legacy headers).
        *   Apply specific limiters to specific routes or groups of routes.
        *   Consider using a persistent store (like Redis) for the rate limiter in a distributed environment.

*   ### Caching Headers Middleware
    *   **Purpose**: For GET requests that return data that doesn't change frequently, this middleware would set appropriate HTTP caching headers (e.g., `Cache-Control`, `ETag`, `Last-Modified`).
    *   **Benefits**:
        *   Reduces server load by allowing clients and CDNs/proxies to cache responses.
        *   Improves response times for clients retrieving cached data.
    *   **Implementation Sketch**:
        *   A middleware that analyzes the request (e.g., specific paths) and the response content.
        *   Sets headers like `Cache-Control: public, max-age=3600` for data cacheable for an hour.
        *   Could generate `ETag`s based on response content for conditional requests.

*   ### Tenant/Organization Context Middleware (Future - If Multi-Tenancy is Added)
    *   **Purpose**: If the platform evolves to support multiple tenants or organizations using isolated data, this middleware would identify the tenant from the request (e.g., via subdomain, header, or user's JWT claims) and attach the tenant context to the `req` object.
    *   **Benefits**: Simplifies data scoping and access control in a multi-tenant architecture.

*   ### Feature Flag Middleware (Future - For A/B Testing or Phased Rollouts)
    *   **Purpose**: To enable or disable specific features or API behaviors based on configuration, user segments, or other criteria.
    *   **Benefits**: Allows for controlled feature rollouts, A/B testing, and quick disabling of problematic features without redeployment.
    *   **Implementation Sketch**:
        *   Middleware reads feature flag configurations (from a config file, database, or feature flag service).
        *   Modifies `req` object (e.g., `req.features = { newCheckout: true }`) or directly alters behavior (e.g., by calling a different service method).

By implementing these suggested middlewares progressively, the application can become more robust, secure, performant, and easier to manage.
