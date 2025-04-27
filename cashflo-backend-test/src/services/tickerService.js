// src/services/tickerService.js
import { prisma } from '../config/database.js'; // Import the prisma client instance

/**
 * Retrieves the distinct list of all tickers currently in any user's watchlist using Prisma.
 * @returns {Promise<Set<string>>} - A promise resolving to a Set of tickers.
 */
export async function getMasterTickerList() {
    try {
        const distinctTickers = await prisma.watchlist.findMany({
            distinct: ['ticker'], // Get distinct values based on the 'ticker' field
            select: {
                ticker: true,   // Select only the ticker field
            },
        });
        // Convert the array of { ticker: 'AAPL' } objects to a Set of strings
        const tickerSet = new Set(distinctTickers.map(item => item.ticker));
        // console.log('Fetched master ticker list via Prisma:', Array.from(tickerSet));
        return tickerSet;
    } catch (error) {
        console.error('Error fetching master ticker list via Prisma:', error);
        return new Set(); // Return empty set on error
    }
}

// No add/remove functions needed here anymore, managed via controllers directly.