// src/services/cacheService.js
import redisClient from '../config/redisClient.js';

const CACHE_EXPIRY_SECONDS = 300; // Cache stock data for 5 minutes

/**
 * Caches data for multiple stock tickers in Redis.
 * @param {Object} stockData - Object where keys are tickers and values are data objects.
 */
export async function cacheStockUpdates(stockData) {
  if (!stockData || Object.keys(stockData).length === 0) return;

  const pipeline = redisClient.pipeline();
  let cachedCount = 0;

  for (const [ticker, data] of Object.entries(stockData)) {
    if (data) { // Only cache valid data, not null entries
      const key = `stock:${ticker}`;
      pipeline.set(key, JSON.stringify(data), 'EX', CACHE_EXPIRY_SECONDS);
      cachedCount++;
    }
  }

  if (cachedCount > 0) {
    try {
      await pipeline.exec();
      console.log(`Cached ${cachedCount} stock updates.`);
    } catch (error) {
      console.error("Error executing Redis cache pipeline:", error);
    }
  }
}

/**
 * Retrieves cached data for a single stock ticker.
 * @param {string} ticker
 * @returns {Promise<Object|null>} - Parsed data object or null if not found/error.
 */
export async function getCachedStockData(ticker) {
    const key = `stock:${ticker}`;
    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error(`Error retrieving cache for ${ticker}:`, error);
        return null;
    }
}