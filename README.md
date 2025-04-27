# Stock Data Backend API & WebSocket Service

This project provides a Node.js backend service designed to deliver near real-time stock market data updates to connected clients via WebSockets (Socket.IO). It fetches data periodically from Yahoo Finance, caches it using Redis, manages user watchlists in a PostgreSQL database via Prisma, and handles user authentication using JWT.

The repository also includes a simple Node.js test client in the `cashflo-ws-test` directory to demonstrate and verify WebSocket functionality.

## Features

* JWT-based user registration and login.
* Secure WebSocket (Socket.IO) connections authenticated via JWT.
* Targeted stock data updates broadcast to subscribed clients via Socket.IO rooms.
* Periodic fetching of stock quote data for user watchlists from Yahoo Finance (`yahoo-finance2`).
* Caching of latest stock data using Redis.
* REST API for managing user watchlists (add/get/remove).
* PostgreSQL database persistence using Prisma ORM.
* Includes a basic Node.js WebSocket test client (`cashflo-ws-test`).

## Architecture Overview

This backend follows a typical client-server architecture enhanced with real-time capabilities:

1.  **API Layer (Express):** Handles standard HTTP requests for user authentication (`/api/auth/*`) and watchlist management (`/api/stocks/watchlist`). User requests for protected endpoints must include a valid JWT in the `Authorization: Bearer <token>` header. API controllers interact with services and the database (Prisma).
2.  **WebSocket Layer (Socket.IO):** Manages persistent, real-time connections with clients.
    * **Authentication:** New connections are authenticated using a JWT provided by the client during the handshake (`io.use()` middleware). Unauthenticated connections are rejected.
    * **Subscription:** Authenticated clients emit `subscribe` events with tickers. The server joins the corresponding socket to specific Socket.IO rooms (e.g., `stock_AAPL`). Clients emit `unsubscribe` to leave rooms.
    * **Broadcasting:** The server emits `stock_update` events targeted to specific rooms (`io.to(roomName).emit(...)`) when new data is available for that ticker.
3.  **Data Fetching Service:** A background process (`setInterval`) runs periodically:
    * It queries the database via `tickerService` (using Prisma) to get the distinct list of all tickers currently in *any* user's watchlist (`getMasterTickerList`).
    * It uses `yahooFinanceService` (using `yahoo-finance2`) to fetch the latest quote data for these tickers.
    * **Note:** This relies on Yahoo Finance data, which may be delayed and is subject to rate limits. The fetch interval (`Workspace_INTERVAL_MS`) should be set carefully.
4.  **Caching Service (Redis):** Fetched data is stored temporarily in Redis (using `cacheService`) with an expiry time. Primarily used by the search endpoint currently.
5.  **Database (PostgreSQL & Prisma):** Stores user credentials (hashed passwords) and the relationship between users and the tickers in their watchlists. Prisma provides type-safe database access.

### Diagram

![High-Level Architecture Diagram](assets/architecture-diagram-cashflo.png)
*Note: This diagram provides a high-level overview. See the code structure and descriptions for details on specific services, authentication layers, and data flow.*

## Technology Stack

* **Backend:** Node.js, Express.js
* **Real-time:** Socket.IO
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Caching:** Redis (`ioredis` client)
* **Authentication:** JWT (`jsonwebtoken`, `bcryptjs`)
* **Data Source:** `yahoo-finance2`
* **Environment:** `dotenv`
* **WS Test Client:** Node.js, `socket.io-client`, `dotenv`

## Setup and Installation

### Backend Server (`/`)

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/SagnikGos/trading-backend
    cd cashflo-backend-test
    ```
2.  **Install Backend Dependencies:**
    ```bash
    npm install
    ```
3.  **Set up PostgreSQL:**
    * Install PostgreSQL if you haven't already.
    * Create a database (e.g., `stock_app`) and a user with privileges for that database.
4.  **Set up Redis:**
    * Install and run a Redis instance (e.g., via Docker or native installation). Ensure it's accessible from the backend.
5.  **Configure Backend Environment Variables:**
    * Copy the `.env.example` file (if provided) or create a new `.env` file in the project root (`cashflo-backend-test/.env`).
    * Fill in the required variables (see **Backend Environment Variables** section below). Most importantly: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`.
6.  **Run Database Migrations:**
    * Apply the database schema using Prisma Migrate:
        ```bash
        npx prisma migrate dev
        ```
    * (Optional) Generate the Prisma client if needed:
        ```bash
        npx prisma generate
        ```

### WebSocket Test Client (`/stock-client-test`)

1.  **Navigate to Test Client Directory:**
    ```bash
    cd cashflo-ws-test
    ```
2.  **Install Test Client Dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Test Client Environment Variables:**
    * Create a new `.env` file **inside the `cashflo-ws-test` directory** (`cashflo-ws-test/.env`).
    * Fill in the required variables (see **Test Client Environment Variables** section below). You **must** provide a valid `JWT_TOKEN` obtained by logging in via the backend API.

## Running the Application

### 1. Start the Backend Server

* Navigate to the project root directory (`cashflo-backend-test/`).
* **Development:**
    ```bash
    npm run dev # If you have nodemon configured in package.json
    ```
    *or*
    ```bash
    npm start # Or directly: node src/server.js
    ```
* The server will start, connect to Redis and PostgreSQL, initialize Socket.IO, and begin the periodic data fetching loop.

### 2. Run the WebSocket Test Client (Optional)

* Open a **new terminal window**.
* Navigate to the test client directory:
    ```bash
    cd cashflo-ws-test
    ```
* Ensure the backend server is running and you have configured the client's `.env` file (especially `JWT_TOKEN`).
* Run the client:
    ```bash
    node client.js
    ```
* Observe the console output for connection status, subscription confirmations, and incoming `stock_update` messages.

## API Endpoints

Base path: `/api`

* **Authentication (`/auth`)**
    * `POST /register`: Register a new user. Body: `{ "email": "...", "password": "..." }`
    * `POST /login`: Log in a user. Body: `{ "email": "...", "password": "..." }`. Returns JWT token.
* **Stocks (`/stocks`)** - Require `Authorization: Bearer <token>` header
    * `GET /watchlist`: Get the authenticated user's watchlist.
    * `POST /watchlist`: Add tickers to the watchlist. Body: `{ "tickers": ["AAPL", "MSFT"] }`
    * `DELETE /watchlist`: Remove tickers from the watchlist. Body: `{ "tickers": ["AAPL", "MSFT"] }`
    * `GET /search/:ticker`: Search for current data for a specific ticker.

## WebSocket Events

* **Client Emits (to Server):**
    * `subscribe` (payload: `string[]` - Array of tickers to subscribe to)
    * `unsubscribe` (payload: `string[]` - Array of tickers to unsubscribe from)
* **Server Emits (to Client):**
    * `welcome` (payload: `{ message: string }` - Sent on successful authenticated connection)
    * `subscribed` (payload: `string[]` - Confirmation of subscribed tickers)
    * `unsubscribed` (payload: `string[]` - Confirmation of unsubscribed tickers)
    * `stock_update` (payload: `{ TICKER: { price, change, ..., timestamp } }` - Contains update for a single ticker, sent to the corresponding room)

## Environment Variables

### Backend (`/.env`)

```dotenv
# --- Server Configuration ---
PORT=3001
# NODE_ENV=development

# --- Application Logic ---
FETCH_INTERVAL_MS=20000 # Fetch interval in ms

# --- External Services ---
REDIS_URL=redis://localhost:6379
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL="postgresql://your_db_user:your_db_password@localhost:5432/stock_app"

# --- Security / Authentication ---
JWT_SECRET=YourVeryStrongJwtSecretKeyHere!PleaseChangeMe # CHANGE THIS!
JWT_EXPIRES_IN=1h
BCRYPT_SALT_ROUNDS=10

# --- CORS ---
# Comma-separated list of allowed frontend origins
CORS_ORIGINS=http://localhost:3000
    Client -- HTTP API Requests --> LB;
    Client -- WebSocket Connection --> LB;
    TestClient -- WebSocket Connection --> WSServer; # Test client might connect directly
    TestClient -- HTTP API Requests --> ServerAPI; # Test client might call API too
    WebsocketService -- Pushes Updates --> Client;
    WebsocketService -- Pushes Updates --> TestClient;

    Client -- HTTP API Requests --> LB;
    Client -- WebSocket Connection --> LB;
    TestClient -- WebSocket Connection --> WSServer; # Test client might connect directly
    TestClient -- HTTP API Requests --> ServerAPI; # Test client might call API too
    WebsocketService -- Pushes Updates --> Client;
    WebsocketService -- Pushes Updates --> TestClient;
