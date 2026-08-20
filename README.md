# CashFlo Terminal: Real-Time Trading Engine & TUI

CashFlo is a high-performance, event-driven trading simulator and real-time market data platform. It features an in-memory limit order matching engine, a real-time portfolio manager, and a rich Bloomberg-style Terminal UI (TUI).

## Highlights (For Resume)

*   **Event-Driven Trading Engine:** Built an in-memory limit/market order matching engine that processes high-frequency stock ticks in real time.
*   **Transactional Portfolio State:** Engineered ACID-compliant portfolio tracking using Prisma transactions to prevent race conditions during high-speed trade execution.
*   **Market Data Simulation:** Implemented a Geometric Brownian Motion market simulator as a fallback for external API rate limits (bypassing Yahoo Finance 429s).
*   **Rich Terminal UI (TUI):** Developed a keyboard-driven interactive terminal dashboard using `blessed` and `blessed-contrib` to stream live prices, ASCII tables, and portfolio updates via Socket.IO.
*   **Sub-Millisecond Execution:** The tick processor evaluates all open orders and updates user balances and positions synchronously within the event loop.

## Components

1.  **Backend (`cashflo-backend`):** Node.js/Express HTTP API, Socket.IO broadcaster, SQLite Database (Prisma), and a simulated Market Data Feed.
2.  **Terminal Client (`cashflo-ws`):** Interactive command-line dashboard for trading.

## Running the Platform

### The 1-Click Start (Windows)
Just double-click the `start.bat` file in the root directory, or run it from your terminal:
```bash
.\start.bat
```
*This will automatically launch the backend server in a new window, wait for it to initialize, and then start the beautiful Terminal UI in your current window!*

### Manual Startup
If you prefer starting them separately:
1.  **Backend:** `cd cashflo-backend` then `npm run dev`
2.  **Terminal Client:** `cd cashflo-ws` then `npm run dashboard`

### Terminal Commands
In the terminal's command prompt (bottom), try:
* `watch TSLA` (Add TSLA to live feeds and graph)
* `buy AAPL 10 200` (Buy 10 shares of AAPL at a limit price of $200) 
* `buy GOOG 5` (Market order to instantly buy 5 shares)
