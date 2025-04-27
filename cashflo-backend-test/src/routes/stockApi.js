// src/routes/stockApi.js
import express from 'express';
import {
    getWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    searchStock
} from '../controllers/stockController.js';

const router = express.Router();

// --- Watchlist Routes ---
// The user ID is now obtained from req.user.id set by the authMiddleware
router.get('/watchlist', getWatchlist);         // GET /api/stocks/watchlist
router.post('/watchlist', addToWatchlist);        // POST /api/stocks/watchlist (Expects { "tickers": [...] } in body)
router.delete('/watchlist', removeFromWatchlist); // DELETE /api/stocks/watchlist (Expects { "tickers": [...] } in body)

// --- Stock Search Route ---
// This is also protected by the authMiddleware applied in routes/index.js
router.get('/search/:ticker', searchStock);     // GET /api/stocks/search/SOME_TICKER

export default router;