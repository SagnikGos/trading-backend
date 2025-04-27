// src/controllers/stockController.js
// CORRECT VERSION using req.user.id from JWT middleware

import { prisma } from '../config/database.js';
import { fetchStockData } from '../services/yahooFinanceService.js';
import { getCachedStockData } from '../services/cacheService.js';
import { Prisma } from '@prisma/client';

// --- Watchlist Handlers ---

export async function getWatchlist(req, res) {
    // Get userId from middleware attached user object
    const userId = req.user?.id;
    if (!userId) {
        // Middleware should prevent this, but double-check
        return res.status(401).json({ error: 'User not authenticated' });
    }

    try {
        const watchlistItems = await prisma.watchlist.findMany({
            where: { userId: userId }, // Use userId from req.user
            select: { ticker: true },
            orderBy: { ticker: 'asc' },
        });
        res.status(200).json(watchlistItems.map(item => item.ticker));
    } catch (error) {
        console.error(`Error getting watchlist for user ${userId} via Prisma:`, error);
        res.status(500).json({ error: 'Failed to retrieve watchlist' });
    }
}

export async function addToWatchlist(req, res) {
    // Get userId from middleware
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    const { tickers } = req.body;
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: 'Invalid or missing tickers array in request body' });
    }
    const validTickers = tickers
        .filter(t => typeof t === 'string' && t.length > 0 && t.length < 20)
        .map(t => t.toUpperCase());
    if (validTickers.length === 0) {
        return res.status(400).json({ error: 'No valid tickers provided' });
    }

    const dataToCreate = validTickers.map(ticker => ({
        userId: userId, // Use userId from req.user
        ticker: ticker,
    }));

    try {
        const result = await prisma.watchlist.createMany({
            data: dataToCreate,
            skipDuplicates: true,
        });
        console.log(`Added/updated watchlist for user ${userId}. Count: ${result.count}`);
        res.status(201).json({ success: true, addedCount: result.count, requestedTickers: validTickers });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
             return res.status(404).json({ error: `User with ID ${userId} not found.` });
        }
        console.error(`Error adding to watchlist for user ${userId} via Prisma:`, error);
        res.status(500).json({ error: 'Failed to update watchlist' });
    }
}

export async function removeFromWatchlist(req, res) {
    // Get userId from middleware
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    const { tickers } = req.body;
     if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: 'Invalid or missing tickers array in request body' });
    }
    const validTickers = tickers
        .filter(t => typeof t === 'string' && t.length > 0 && t.length < 20)
        .map(t => t.toUpperCase());
    if (validTickers.length === 0) {
        return res.status(400).json({ error: 'No valid tickers provided' });
    }

    try {
        const result = await prisma.watchlist.deleteMany({
            where: {
                userId: userId, // Use userId from req.user
                ticker: {
                    in: validTickers,
                },
            },
        });
        console.log(`Removed tickers from watchlist for user ${userId}. Count: ${result.count}`);
        res.status(200).json({ success: true, removedCount: result.count, requestedTickers: validTickers });
    } catch (error) {
        console.error(`Error removing from watchlist for user ${userId} via Prisma:`, error);
        res.status(500).json({ error: 'Failed to update watchlist' });
    }
}


// --- Stock Search Handler --- (This one was okay as it didn't use userId)
export async function searchStock(req, res) {
    const ticker = req.params.ticker?.toUpperCase();
    if (!ticker || ticker.length > 20) {
        return res.status(400).json({ error: 'Invalid ticker symbol' });
    }
    try {
        let stockData = await getCachedStockData(ticker);
        if (stockData) {
            console.log(`Cache hit for search: ${ticker}`);
            return res.status(200).json({ [ticker]: stockData });
        }
        console.log(`Cache miss for search: ${ticker}. Fetching...`);
        const results = await fetchStockData([ticker]);
        stockData = results ? results[ticker] : null;
        if (stockData) {
            res.status(200).json({ [ticker]: stockData });
        } else {
            res.status(404).json({ error: `Data not found for ticker: ${ticker}` });
        }
    } catch (error) {
        console.error(`Error searching stock ${ticker}:`, error);
        res.status(500).json({ error: 'Failed to search stock data' });
    }
}