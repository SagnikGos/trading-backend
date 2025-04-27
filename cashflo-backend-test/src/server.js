// src/server.js
import express from 'express';
import http from 'http';
import { config } from './config/index.js';
import redisClient from './config/redisClient.js';
import { prisma, disconnectPrisma } from './config/database.js'; // Import prisma and disconnect function
import { initWebSocketServer, broadcastStockUpdate } from './services/websocketService.js';
import { fetchStockData } from './services/yahooFinanceService.js';
import { cacheStockUpdates } from './services/cacheService.js';
import { getMasterTickerList } from './services/tickerService.js';
import apiRoutes from './routes/index.js';

// --- Initialization ---
const app = express();
const server = http.createServer(app);

// --- Middleware ---
app.use(express.json());

// --- API Routes ---
app.use('/api', apiRoutes);

// Initialize Socket.IO Server
initWebSocketServer(server);

// --- Periodic Data Fetching Logic ---
async function runPeriodicFetch() {
    // Await getMasterTickerList as it now involves an async DB call
    const tickersToFetch = Array.from(await getMasterTickerList());

    if (tickersToFetch.length === 0) {
        // console.log("No tickers in master list, skipping fetch."); // Less verbose
        return;
    }
    console.log(`Workspaceing data for tickers: ${tickersToFetch.join(', ')}`);
    try {
        const results = await fetchStockData(tickersToFetch);
        if (results && Object.keys(results).length > 0) {
            const validUpdates = Object.entries(results)
                                       .filter(([_, data]) => data !== null);
            if (validUpdates.length > 0) {
                const dataToCache = Object.fromEntries(validUpdates);
                await cacheStockUpdates(dataToCache);
                // console.log(`Broadcasting ${validUpdates.length} updates...`);
                for (const [ticker, data] of validUpdates) {
                    broadcastStockUpdate(ticker, data);
                }
            } else {
                console.log("No valid stock data retrieved in this fetch cycle."); // Less verbose
            }
        }
    } catch (error) {
        console.error('Error in periodic fetch cycle:', error);
    }
}

// --- Basic Health Check Route ---
app.get('/health', async (req, res) => {
    try {
        // Check DB connection by making a simple query
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ status: 'OK', redis: redisClient.status, db: 'connected' });
    } catch (dbError) {
        console.error("Health check DB error:", dbError);
        res.status(503).json({ status: 'Service Unavailable', redis: redisClient.status, db: 'error' });
    }
});

// --- Start Server ---
server.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
    console.log(`Starting periodic fetch every ${config.fetchIntervalMs} ms`);
    setInterval(runPeriodicFetch, config.fetchIntervalMs);
    // runPeriodicFetch(); // Optional immediate fetch
});

// --- Graceful Shutdown ---
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach(signal => {
    process.on(signal, async () => {
        console.log(`\n${signal} received: closing server...`);
        try {
            // Close HTTP server first
            server.close(async () => {
                console.log('HTTP server closed.');
                // Disconnect Prisma client
                await disconnectPrisma(); // Use the disconnect function from config
                // Close Redis connection
                await redisClient.quit();
                console.log('Redis connection closed.');
                process.exit(0); // Exit cleanly
            });

             // Force exit after timeout
             setTimeout(() => {
                console.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 10000); // 10 seconds timeout

        } catch (err) {
            console.error('Error during shutdown:', err);
            process.exit(1);
        }
    });
});