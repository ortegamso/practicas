# Postman Test Collection for Crypto Trading Bot Backend API

This directory contains Postman assets for testing the Backend API of the Crypto Trading Bot platform.

## Contents

-   **`collections/`**: Contains the main Postman collection JSON file(s).
    -   `Backend_API.postman_collection.json` (Main collection - requires manual merging of fragments)
    -   `Backend_API_Phase2_Items.postman_collection_fragment.json`
    -   `Backend_API_Phase4_StrategyConfig_Items.postman_collection_fragment.json`
    -   `Backend_API_Phase5_EcommReferralSupport_Items.postman_collection_fragment.json`
    -   `Backend_API_Phase6_MarketplaceSandbox_Items.postman_collection_fragment.json`
    -   `Backend_API_Phase7_AdminAnalytics_Items.postman_collection_fragment.json`
-   **`environments/`**: Contains Postman environment JSON file(s).
    -   `local_development.postman_environment.json`
-   **`assets/`**: (Currently empty) Can be used for sample data files, test scripts, etc.

## Prerequisites

1.  **Postman Desktop App**: Install the latest version of Postman.
2.  **Running Backend Application**: Ensure the backend server and all its dependent services (Databases, Kafka, Redis) are running locally, typically via `docker-compose up -d` from the project root, followed by `npm run dev` (or `npm start`) in the `backend` directory.
3.  **Backend Seeding (Optional but Recommended)**: Some tests might rely on initial data (e.g., an admin user, default referral levels). If a seeder script is available (`backend/scripts/seeder.sql` or equivalent), run it. The "Register Admin User" request in the collection can also be used if the endpoint allows initial admin creation.

## Setup Instructions

1.  **Import Environment**:
    *   In Postman, click on "Environments" in the left sidebar.
    *   Click "Import".
    *   Select the `postman/environments/local_development.postman_environment.json` file.
    *   After importing, select the "Local Development Environment" as your active environment in Postman (top-right dropdown).
    *   **Important**: Review and update placeholder values in the environment, especially:
        *   `admin_email`, `admin_password`: Set these to credentials you will use for your admin user.
        *   `user_email`, `user_password`: Set these for your regular test user.
        *   The metadata fields like `id`, `_postman_exported_at`, `_postman_exported_using` in the environment JSON file might need manual correction if they were not dynamically replaced during generation (e.g., set `id` to a new UUID or let Postman assign one).

2.  **Import Collection & Merge Fragments**:
    *   In Postman, click on "Collections" in the left sidebar.
    *   Click "Import".
    *   Select the `postman/collections/Backend_API.postman_collection.json` file. This file currently only contains Health Check and initial Auth requests.
    *   **Manual Merging Required**:
        *   Open the `Backend_API.postman_collection.json` file in a text editor.
        *   Open each fragment file (e.g., `Backend_API_Phase2_Items.postman_collection_fragment.json`) one by one.
        *   Copy the JSON content of the fragment (which typically starts with a comma `,` and contains a folder object `{...}`).
        *   Paste this content into the main `item` array of `Backend_API.postman_collection.json`, after the last existing folder object, ensuring commas are correctly placed between folder objects.
        *   **Example**: If `item` array is `[ {folderA} ]`, and fragment is `,{folderB}`, it becomes `[ {folderA},{folderB} ]`.
        *   The correct order of fragments to append is: Phase2, Phase4, Phase5, Phase6, Phase7.
    *   After merging, save the main `Backend_API.postman_collection.json` file. If you already imported it, you might need to delete and re-import, or update it from the file if Postman supports that.
    *   **Placeholders in Collection**: Review the "Register New User" and "Register Admin User" request bodies. The dynamic parts like `testuser_\${Date.now()}` were intended to be replaced by Postman's dynamic variables (e.g., `testuser_{{$randomInt}}`). You may need to manually adjust these in Postman after import if they appear as literal strings.

## Using the Collection - Environment Variables

The collection relies heavily on environment variables:

-   `{{baseUrl}}`: Automatically set to `http://localhost:4000/api/v1`.
-   `{{admin_email}}`, `{{admin_password}}`: Credentials for admin login.
-   `{{user_email}}`, `{{user_password}}`: Credentials for regular user login.
-   `{{admin_jwt_token}}`, `{{user_jwt_token}}`: These are **automatically populated** when you run the "Login Admin" and "Login User" requests, respectively. Their test scripts save the received token.
-   Various `created_..._id` and `..._slug` variables: These are also **automatically populated** by test scripts in specific `POST` (create) requests (e.g., creating a product saves its ID to `created_product_id`). This allows subsequent requests (GET one, PUT, DELETE) to use these IDs.

**Initial Setup Flow in Postman:**

1.  Ensure your environment is selected.
2.  (Optional, if no admin exists) Run the "01 - Authentication > Register Admin User (Manual/Seed First)" request once. You might need to adjust the email/password in the request body to match your environment variables or desired admin credentials.
3.  Run "01 - Authentication > Login Admin". This will populate `{{admin_jwt_token}}`.
4.  Run "01 - Authentication > Register New User". This will register a dynamic user and populate `{{created_user_id}}`.
5.  Run "01 - Authentication > Login User" (using `{{user_email}}` and `{{user_password}}` which should match the details you'd use for a standard test user, or use the dynamic email from the previous step if you adapt the login request). This will populate `{{user_jwt_token}}`.

Now you are set up to run other requests.

## Testing Use Cases & Flows

It's recommended to run requests in an order that respects dependencies (e.g., create an item before trying to get or update it). The folders are numbered to suggest a logical flow.

### 00 - Health Check
-   **Get API Health**: Verifies the API is up and running.

### 01 - Authentication
1.  **Register New User**: Creates a new standard user.
2.  **Login User**: Logs in the user created/defined in environment variables. Saves `user_jwt_token`.
3.  **(If needed) Register Admin User**: Creates an admin (if not seeded).
4.  **Login Admin**: Logs in the admin. Saves `admin_jwt_token`.
5.  **Get My Profile (User)**: Uses `{{user_jwt_token}}` to fetch the logged-in user's profile.

### 02 - Exchange & Trading Data (User Authenticated - `{{user_jwt_token}}`)
*Prerequisite: User is logged in.*
1.  **Create Exchange Config**: Add API keys for an exchange (e.g., Binance). Replace placeholders `YOUR_BINANCE_API_KEY_HERE` and `YOUR_BINANCE_API_SECRET_HERE` in the request body. This saves `{{user_exchange_config_id}}`.
2.  **List My Exchange Configs**: View all added configs.
3.  **Get Exchange Config by ID**: View the specific config created.
4.  **Update Exchange Config**: Modify the created config.
5.  **Wallet - Get All Balances**: Fetch balances for all active configs.
6.  **Wallet - Get Balance for Specific Config**: Fetch balance for the created config.
7.  **Market Data - Fetch Markets**: Get symbols for the created config.
8.  **Market Data - Fetch Ticker/OrderBook**: Get specific market data.
9.  **Delete Exchange Config**: Clean up the created config.

### 03 - Strategy Configuration (User Authenticated - `{{user_jwt_token}}`)
*Prerequisite: User is logged in, `{{user_exchange_config_id}}` is set.*
1.  **Create Strategy Config**: Define a new trading strategy using the `{{user_exchange_config_id}}`. Saves `{{user_strategy_config_id}}`.
2.  **List My Strategy Configs**: View user's strategies.
3.  **Get Strategy Config by ID**: View the created strategy.
4.  **Update Strategy Config**: Modify parameters or activate/deactivate.
5.  **Delete Strategy Config**: Remove the strategy (ensure it's not 'running').

### 04 - E-commerce, Referrals, Support

#### E-commerce - Products (Admin: `{{admin_jwt_token}}`, Public: No Auth)
1.  **Admin: Create Product**: An admin adds a new product. Saves `{{created_product_id}}` and `{{created_product_slug}}`.
2.  **List Public Products**: Anyone can list available products.
3.  **Get Product by ID or Slug (Public)**: Anyone can view a specific product using `{{created_product_slug}}`.
4.  **Admin: Update Product**: Admin modifies the created product.
5.  **Admin: Delete Product**: Admin removes the product. (Run this last for product tests).

#### E-commerce - Orders (User: `{{user_jwt_token}}`, Admin: `{{admin_jwt_token}}`)
*Prerequisite: A product exists (`{{created_product_id}}` is set).*
1.  **User: Create Order**: User places an order for the product. Saves `{{created_order_id}}` and `{{created_order_custom_id}}`.
2.  **User: List My Orders**: User views their order history.
3.  **User: Get My Order by ID**: User views the specific order created.
4.  **Admin: List All Orders**: Admin views all system orders.
5.  **Admin: Update Order Status**: Admin changes the status of the created order (e.g., to 'processing' or 'completed').

#### Referral System (User: `{{user_jwt_token}}`, Admin: `{{admin_jwt_token}}`)
*Prerequisite: User logged in, Admin logged in. An order (`{{created_order_id}}`) might be needed for commission trigger.*
1.  **Admin: Set Referral Level**: Admin defines commission for Level 1 (e.g., 10%).
2.  **User: Get My Referral Code**: User retrieves their unique referral code. Saves to `{{created_referral_code}}`.
3.  *(Manual Step: Register a NEW user using this referral code. Then that new user places an order that gets completed.)*
4.  **Admin: Trigger Order Commission Processing**: Admin manually triggers commission for the *new user's completed order ID*. This will generate commission for the original user (`{{user_jwt_token}}`).
5.  **User: Get My Commissions**: Original user checks their earned commissions.
6.  **User: Get My Direct Referrals**: Original user sees the new user they referred.

#### Support Ticket System (User: `{{user_jwt_token}}`, Admin: `{{admin_jwt_token}}`)
*Prerequisite: User logged in, Admin logged in. `{{created_order_custom_id}}` might be used in ticket subject.*
1.  **User: Create Support Ticket**: User submits a support query. Saves `{{created_support_ticket_id}}` and `{{created_support_ticket_custom_id}}`.
2.  **User: Add Reply to My Ticket**: User adds a follow-up to their ticket.
3.  **Admin: List All Tickets**: Admin views incoming tickets.
4.  **Admin: Update Ticket**: Admin replies (via `Add Reply` using admin token, if service logic supports it for status change) or updates status/assignment of the user's ticket. For example, assign `{{admin_id}}` as agent.

### 05 - Marketplace & Sandbox (User/Author: `{{user_jwt_token}}`, Admin: `{{admin_jwt_token}}`)
1.  **Author: Submit New Script**: User submits a script. Saves `{{created_marketplace_script_id}}` and `{{created_marketplace_script_slug}}`.
2.  **Author: List My Scripts**: User views their submitted scripts (e.g., filter by `pending_approval`).
3.  **Admin: Update Script (Approve/Reject)**: Admin approves the script and makes it active.
4.  **Public: List Approved Scripts**: Anyone can see the newly approved script.
5.  **Public: Get Script by Slug**: View the script using `{{created_marketplace_script_slug}}`.
6.  **Execute Marketplace Script (Test Run)**: User (author or one with access) runs the script with sample input data.
7.  **Author: Update My Script**: Author updates their script (might trigger re-approval).
8.  **Author: Delete My Script**: Author deletes their script.

### 06 - Admin & Analytics

#### Admin - User Management (Admin: `{{admin_jwt_token}}`)
*Prerequisite: Admin logged in. `{{created_user_id}}` from initial user registration.*
1.  **Admin: List All Users**: View platform users.
2.  **Admin: Get User by ID**: View the specific user created earlier.
3.  **Admin: Update User**: Modify roles or verify email for the user.
4.  **Admin: Set User Active Status (Deactivate/Activate)**: Change user's active status.

#### Analytics (User: `{{user_jwt_token}}`)
*Prerequisite: User logged in. Some bot transactions should exist for meaningful PNL.*
1.  **User: Get My PNL**: User fetches their (simplified) Profit and Loss statement. Can filter by symbol/dates.

## Notes
-   Many "Create" requests save IDs to environment variables (e.g., `created_product_id`). These are then used by subsequent GET (one), PUT, or DELETE requests for that entity.
-   If a "Delete" request is run, you'll need to run the corresponding "Create" request again to repopulate the ID for other tests.
-   The "Register Admin User" and "Register New User" requests use dynamic values (`{{$randomInt}}`) for usernames and emails to allow them to be run multiple times. However, for login and subsequent actions, ensure your environment variables `user_email`, `admin_email`, etc., match users that actually exist and whose tokens you want to use.
-   This collection provides a comprehensive way to interact with most of the backend API endpoints.

Happy Testing!
