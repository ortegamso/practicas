# Authentication and Authorization Module (`backend/src/auth`)

## 1. Overview

This module is responsible for managing user authentication (verifying who a user is) and authorization (determining what an authenticated user is allowed to do) within the backend application. It handles user registration, login, JWT (JSON Web Token) generation and verification, and role-based access control for API endpoints.

## 2. Components Involved

The authentication and authorization flow involves several key components:

*   **`auth.routes.ts`**: Defines the API endpoints related to authentication (e.g., `/register`, `/login`, `/me`). It maps these routes to the appropriate controller methods.
*   **`auth.controller.ts`**: Handles incoming HTTP requests for auth routes. It performs initial request validation (e.g., checking for required fields) and then calls methods in the `AuthService` to perform the core logic. It formats and sends HTTP responses.
*   **`auth.service.ts`**: Contains the primary business logic for authentication. This includes:
    *   Validating user credentials.
    *   Interacting with the `User` model to create new users or find existing ones.
    *   Managing password hashing and comparison.
    *   Generating JWTs upon successful authentication.
*   **`../../models/mongodb/user.model.ts`**: The Mongoose model defining the schema for user documents stored in MongoDB. It includes fields like `username`, `email`, `passwordHash`, and `roles`. A pre-save hook in this model automatically hashes passwords before saving.
*   **`../../middlewares/auth.middleware.ts`**: Contains Express middleware functions for security:
    *   `protect`: Verifies the JWT sent by the client (typically in the `Authorization` header as a Bearer token). If valid, it decodes the token and attaches the user payload (e.g., ID, roles, email, username) to the `req.user` object for use in subsequent route handlers.
    *   `authorize` (and specific instances like `isAdmin`): Checks if the authenticated user (`req.user`) has the required roles to access a particular endpoint.
*   **`../../config/index.ts`**: Provides configuration values, particularly `JWT_SECRET` (used for signing and verifying tokens) and `JWT_EXPIRES_IN` (token lifetime), loaded from environment variables.
*   **`../../utils/appError.ts`**: Custom error handling class used throughout the auth components to generate consistent error responses.
*   **`bcryptjs` library**: Used for hashing passwords and comparing provided passwords against stored hashes.
*   **`jsonwebtoken` library**: Used for creating and verifying JWTs.

## 3. Authentication Process

Authentication is the process of verifying a user's identity.

### 3.1. User Registration

1.  **API Request**: The client sends a `POST` request to `/api/v1/auth/register` with user details (username, email, password, optional roles) in the request body.
2.  **Controller (`auth.controller.ts`)**:
    *   Receives the request.
    *   Performs basic validation on the input (e.g., presence of required fields, basic format checks).
    *   Calls `AuthService.register()` with the validated user data.
3.  **Service (`auth.service.ts`)**:
    *   Checks if a user with the given email or username already exists in the database to prevent duplicates.
    *   Performs password strength validation (e.g., minimum length).
    *   Creates a new `User` model instance. The plain text password from the DTO is assigned to the `passwordHash` field *temporarily*.
4.  **Model (`user.model.ts`)**:
    *   The `pre('save')` hook on the `UserSchema` intercepts the save operation.
    *   If the `passwordHash` field is modified (and looks like a plain password), it hashes the plain text password using `bcrypt.hash()`.
    *   The hashed password is then stored in the `passwordHash` field of the user document.
5.  **Service (`auth.service.ts` continued)**:
    *   The `newUser.save()` operation completes, storing the user document with the hashed password in MongoDB.
    *   A JWT is generated (see section 3.3).
    *   The service returns the new user's public information (ID, username, email, roles) and the JWT.
6.  **Controller (`auth.controller.ts` continued)**:
    *   Sends a `201 Created` HTTP response to the client with the user information and JWT.

### 3.2. User Login

1.  **API Request**: The client sends a `POST` request to `/api/v1/auth/login` with user credentials (email/username and password) in the request body.
2.  **Controller (`auth.controller.ts`)**:
    *   Receives the request and validates input.
    *   Calls `AuthService.login()` with the credentials.
3.  **Service (`auth.service.ts`)**:
    *   Finds the user in the database by email or username. The `passwordHash` field is explicitly selected as it might be excluded by default in some queries.
    *   If the user is not found, an "Invalid credentials" error is returned.
    *   Uses `bcrypt.compare()` to compare the provided plain text password with the stored `passwordHash` from the user document.
    *   If passwords do not match, an "Invalid credentials" error is returned.
    *   Checks if the user account is active (`user.isActive`).
    *   If authentication is successful, a JWT is generated (see section 3.3).
    *   The service returns the user's public information and the JWT.
4.  **Controller (`auth.controller.ts` continued)**:
    *   Sends a `200 OK` HTTP response to the client with the user information and JWT.

### 3.3. JWT (JSON Web Token) Usage

*   **Generation**: When a user successfully registers or logs in, a JWT is created using the `jsonwebtoken` library.
    *   **Payload**: Contains user-identifying information (e.g., `id`, `username`, `email`, `roles`). This data allows the server to identify the user and their permissions on subsequent requests without needing a database lookup for every request (though fresh data can be fetched if needed, see `protect` middleware).
    *   **Secret**: Signed with a `JWT_SECRET` (from `config.jwt.secret` via environment variables). This secret must be kept confidential.
    *   **Expiration**: Has an expiration time (`expiresIn` from `config.jwt.expiresIn`, e.g., '1d', '7h', '3600s').
*   **Client-Side Handling**: The client receives the JWT and is expected to store it securely (e.g., in `localStorage`, `sessionStorage`, or a secure cookie).
*   **Sending Token**: For subsequent authenticated requests, the client must include the JWT in the `Authorization` header using the Bearer scheme:
    `Authorization: Bearer <your_jwt_token>`

## 4. Authorization Process

Authorization is the process of determining if an authenticated user has permission to access a specific resource or perform an action.

### 4.1. `protect` Middleware

*   This middleware is applied to routes that require authentication.
*   **Token Extraction**: It attempts to extract the JWT from the `Authorization: Bearer <token>` header.
*   **Verification**:
    *   If no token is found, it returns a `401 Unauthorized` error.
    *   It verifies the token using `jsonwebtoken.verify()` and the `JWT_SECRET`.
    *   If the token is invalid (e.g., tampered, incorrect signature) or expired, it returns a `401 Unauthorized` error.
*   **User Attachment**: If the token is valid, the decoded payload (containing user ID, roles, etc.) is attached to the Express `req` object as `req.user`.
    *   The current implementation attaches the decoded payload directly. An alternative (commented out in the middleware) is to use the `id` from the token to fetch the latest user data from the database. This ensures data is always fresh but adds a database query per request.
*   **Next Step**: If verification is successful, it calls `next()` to pass control to the next middleware or route handler.

### 4.2. `authorize` Middleware (and role-specific instances like `isAdmin`)

*   This is a higher-order middleware factory that takes an array of allowed roles (e.g., `[UserRole.ADMIN]`).
*   It's designed to be used *after* the `protect` middleware (which populates `req.user`).
*   **Role Check**: It checks if `req.user` exists and if `req.user.roles` contains at least one of the `allowedRoles`.
*   **Access Control**:
    *   If the user has a required role, it calls `next()` to grant access.
    *   If the user does not have any of the required roles, it returns a `403 Forbidden` error.
*   **Specific Instances**:
    *   `isAdmin = authorize([UserRole.ADMIN])`: Middleware to allow only users with the 'admin' role.
    *   `isTrader = authorize([UserRole.TRADER, UserRole.ADMIN])`: Middleware for trader-specific functionalities, also accessible by admins.

## 5. Key Data Flows & Database Interaction (User Model)

The `User` model (`user.model.ts`) is central to authentication and authorization.

*   **Storage**:
    *   `username`: String, unique.
    *   `email`: String, unique, lowercase.
    *   `passwordHash`: String. **Crucially, plain text passwords are never stored.** Only the bcrypt hash is stored.
    *   `roles`: Array of strings (e.g., `['user']`, `['user', 'admin']`). Defines the user's permissions.
    *   `isActive`: Boolean, controls if the account can log in.
    *   `referralCode`: String, unique, sparse. For the referral system.
*   **Password Hashing**:
    *   When a new user registers or an existing user changes their password (not yet implemented), the plain text password provided is hashed by the `UserSchema.pre('save', ...)` hook using `bcrypt.hash()`.
    *   `bcrypt` is a strong, adaptive hashing algorithm that incorporates a salt to protect against rainbow table attacks.
*   **Password Comparison**:
    *   During login, the `UserSchema.methods.comparePassword = async function (candidatePassword) { ... }` instance method is used.
    *   It takes the plain text password submitted by the user and compares it against the stored `passwordHash` using `bcrypt.compare()`. This function securely handles the comparison without needing to decrypt the stored hash.
*   **Role Usage**:
    *   The `roles` array stored in the user document is included in the JWT payload.
    *   The `authorize` middleware inspects these roles from `req.user.roles` (populated by `protect` middleware from the JWT) to make access control decisions.

## 6. Best Practices Implemented

*   **Password Hashing**: Use of `bcryptjs` for strong, salted password hashing.
*   **JWT for Stateless Authentication**: Tokens carry user information, reducing the need for session storage on the server for many requests.
*   **HTTPS Requirement**: JWTs (Bearer tokens) should always be transmitted over HTTPS in production to prevent interception.
*   **Token Expiration**: JWTs have a defined expiration time, forcing re-authentication.
*   **Separation of Concerns**: Logic is divided into controllers (HTTP layer), services (business logic), and models (data layer).
*   **Middleware for Security**: Centralized handling of JWT verification and role checks via middleware.
*   **Input Validation**: Basic validation in controllers for incoming request data. (Can be enhanced with libraries like Joi or express-validator).
*   **Error Handling**: Consistent error responses using `AppError` and a global error handler.
*   **Role-Based Access Control (RBAC)**: Foundation for controlling access based on user roles.

## 7. Use Cases / Example Flows

1.  **New User Registration**:
    *   Client `POST /api/v1/auth/register` with `{"username": "johndoe", "email": "john@example.com", "password": "password123"}`.
    *   Backend validates, hashes password, creates user in DB, generates JWT.
    *   Backend responds `201 Created` with `{ user: {...}, token: "...", expiresIn: "..." }`.

2.  **User Login**:
    *   Client `POST /api/v1/auth/login` with `{"emailOrUsername": "john@example.com", "password": "password123"}`.
    *   Backend finds user, compares hashed password, generates JWT.
    *   Backend responds `200 OK` with `{ user: {...}, token: "...", expiresIn: "..." }`.

3.  **Accessing Protected Route (e.g., `/api/v1/auth/me`)**:
    *   Client `GET /api/v1/auth/me` with `Authorization: Bearer <valid_jwt_token>`.
    *   `protect` middleware verifies token, extracts user payload, attaches to `req.user`.
    *   `AuthController.getCurrentUser` executes, using `req.user`.
    *   Backend responds `200 OK` with user profile data.

4.  **Failed Access to Protected Route (Invalid/Missing Token)**:
    *   Client `GET /api/v1/auth/me` with no token or an invalid/expired token.
    *   `protect` middleware detects issue.
    *   Backend responds `401 Unauthorized` with an error message.

5.  **Accessing Admin Route by Non-Admin**:
    *   Client (non-admin user) `GET /api/v1/admin/users` (assuming this route is protected by `protect` and `isAdmin`) with their valid user token.
    *   `protect` middleware validates token, `req.user` is populated.
    *   `isAdmin` (via `authorize`) middleware checks `req.user.roles`, finds no 'admin' role.
    *   Backend responds `403 Forbidden`.

## 8. Configuration

Key environment variables (managed via `config/index.ts` and `.env` files) for this module:

*   `JWT_SECRET`: A long, random, secret string used to sign and verify JWTs. **Critical for security.**
*   `JWT_EXPIRES_IN`: The lifetime of a JWT (e.g., "1d", "7h", "3600s").

---
This document provides a comprehensive overview of the authentication and authorization mechanisms within the application.
