// src/services/yahooFinanceService.js
import yahooFinance from 'yahoo-finance2';

/**
 * Fetches quote data for a list of stock tickers using yahoo-finance2.
 * Handles regularMarketTime potentially being a Date object received from the library.
 * @param {string[]} tickers - Array of stock tickers (e.g., ["AAPL", "MSFT"]).
 * @returns {Promise<Object>} - A promise resolving to an object where keys are tickers
 * and values are the processed quote data objects (or null if fetch failed for a specific ticker).
 * Example: { "AAPL": { price: 150.0, change: 1.0, ..., timestamp: Date }, "MSFT": null }
 */
export async function fetchStockData(tickers) {
    // --- Input Validation ---
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
        console.warn("[Yahoo Service] fetchStockData called with invalid or empty tickers array.");
        return {}; // Return empty object if no valid tickers provided
    }

    const results = {}; // Object to store processed results for each ticker

    // --- Define Fields for Yahoo Finance Query ---
    // Specify desired fields to potentially reduce payload size and ensure needed fields are present
    const queryOptions = {
        fields: [
            'symbol', 'shortName', 'regularMarketPrice', 'regularMarketChange',
            'regularMarketChangePercent', 'regularMarketVolume', 'marketState',
            'regularMarketTime' // Ensure we request the time field
            // Add other fields like 'regularMarketOpen', 'regularMarketDayHigh', etc. if needed
        ]
    };

    try {
        // --- Make the API Call ---
        console.log(`   [Yahoo Service] Requesting quote for: ${tickers.join(', ')} from yahoo-finance2...`);
        // yahooFinance.quote handles fetching multiple tickers efficiently
        const quoteResults = await yahooFinance.quote(tickers, queryOptions);

        // --- Process the Results ---
        // Ensure quoteResults is consistently an array, filtering out potential nulls/undefined in the library's response
        const quotesArray = Array.isArray(quoteResults)
            ? quoteResults.filter(q => q) // Filter out falsy values if it's an array
            : [quoteResults].filter(q => q); // Make it an array if single object, then filter

        console.log(`   [Yahoo Service] Received ${quotesArray.length} valid results from yahoo-finance2 library.`);

        // Iterate through each valid quote object returned
        quotesArray.forEach(quote => {
            // Double-check the quote object and that it has a symbol
            if (quote && quote.symbol) {
                const ticker = quote.symbol;
                const marketTime = quote.regularMarketTime; // Get the raw value for the timestamp

                // --- DEBUG LOGGING (Optional but useful) ---
                // console.log(`[DEBUG ${ticker}] Raw regularMarketTime value:`, marketTime, `(Type: ${typeof marketTime}, IsDate: ${marketTime instanceof Date})`);
                // --- END DEBUG LOGGING ---

                let timestampObj = null; // Initialize timestamp as null

                // --- CORRECTED TIMESTAMP HANDLING ---
                // Check if the received marketTime is already a valid Date object
                if (marketTime instanceof Date) {
                    timestampObj = marketTime; // Use the Date object directly

                    // Sanity check: ensure the Date object isn't internally invalid (e.g., "Invalid Date")
                    if (isNaN(timestampObj.getTime())) {
                        console.error(`ERROR: Received Date object for ${ticker} is invalid (parsed as NaN). Resetting timestamp to null.`);
                        timestampObj = null;
                    }
                }
                // Optional Fallback: Handle if it sometimes returns a number (epoch seconds)
                else if (marketTime && typeof marketTime === 'number' && isFinite(marketTime)) {
                     console.warn(`WARN: Received numeric regularMarketTime for ${ticker} instead of Date object:`, marketTime);
                     timestampObj = new Date(marketTime * 1000); // Convert seconds -> ms -> Date
                     // Check validity after conversion
                     if (isNaN(timestampObj.getTime())) {
                        console.error(`ERROR: Failed to create valid Date from numeric marketTime for ${ticker}:`, marketTime);
                        timestampObj = null;
                     }
                }
                // Handle other unexpected types or null/undefined for marketTime
                else if (marketTime !== null && marketTime !== undefined) {
                    console.warn(`WARN: Received unexpected type for regularMarketTime for ${ticker} (Type: ${typeof marketTime}):`, marketTime);
                    // timestampObj remains null
                } else {
                     console.warn(`WARN: Received null/undefined regularMarketTime for ${ticker}`);
                     // timestampObj remains null
                }
                // --- END CORRECTED TIMESTAMP HANDLING ---


                // --- Assign Processed Data to Results ---
                // Store the processed data for this ticker
                results[ticker] = {
                    price: quote.regularMarketPrice,
                    change: quote.regularMarketChange,
                    changePercent: quote.regularMarketChangePercent,
                    volume: quote.regularMarketVolume,
                    marketState: quote.marketState,
                    symbol: ticker,
                    shortName: quote.shortName,
                    timestamp: timestampObj, // Assign the validated Date object (or null)
                };
            } else {
                // Log if the library returned an item in the array that was invalid/missing symbol
                console.warn("[Yahoo Service] WARN: Received an empty or invalid quote object within the results array from yahoo-finance2.");
            }
        }); // End processing loop for each quote

        // --- Final Check ---
        // Ensure all initially requested tickers have an entry in the final results object.
        // If a ticker was requested but no valid data was processed for it, mark it as null.
        tickers.forEach(ticker => {
            if (!results.hasOwnProperty(ticker)) {
                console.warn(`WARN: No result object was processed for requested ticker ${ticker}. Marking data as null.`);
                results[ticker] = null;
            }
        });

    } catch (error) {
        // Handle errors during the main yahooFinance.quote API call
        console.error(`   [Yahoo Service] Critical error during yahooFinance.quote call for [${tickers.join(', ')}]:`, error.message || error);
        // Ensure all requested tickers are marked as null in the results on a general fetch error
        tickers.forEach(ticker => {
            results[ticker] = null;
        });
    }

    // Return the results object (e.g., { AAPL: { ... }, MSFT: null, ... })
    return results;
}