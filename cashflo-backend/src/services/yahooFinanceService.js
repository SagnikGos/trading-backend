// src/services/yahooFinanceService.js
import yahooFinance from 'yahoo-finance2';

// State for simulation
const simulationState = {};

export async function fetchStockData(tickers) {
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
        return {};
    }

    const useSimulation = process.env.SIMULATE_MARKET !== 'false';
    const results = {};

    if (useSimulation) {
        // Geometric Brownian Motion Simulator
        tickers.forEach(ticker => {
            if (!simulationState[ticker]) {
                // Initialize state
                simulationState[ticker] = {
                    price: 100 + Math.random() * 200,
                    volatility: 0.005 + Math.random() * 0.015, // 0.5% to 2% volatility
                    basePrice: 100 + Math.random() * 200
                };
            }

            const state = simulationState[ticker];
            // Random walk step
            const changePercent = (Math.random() - 0.5) * state.volatility;
            state.price = state.price * (1 + changePercent);
            
            // Mean reversion to prevent prices from going to 0 or infinity
            state.price += (state.basePrice - state.price) * 0.01;

            const change = state.price * changePercent;

            results[ticker] = {
                price: parseFloat(state.price.toFixed(2)),
                change: parseFloat(change.toFixed(2)),
                changePercent: parseFloat((changePercent * 100).toFixed(2)),
                volume: Math.floor(Math.random() * 5000),
                marketState: 'REGULAR',
                symbol: ticker,
                shortName: `${ticker} (SIM)`,
                timestamp: new Date()
            };
        });
        return results;
    }

    // --- Yahoo Finance Call ---
    const queryOptions = {
        fields: ['symbol', 'shortName', 'regularMarketPrice', 'regularMarketChange', 'regularMarketChangePercent', 'regularMarketVolume', 'marketState', 'regularMarketTime']
    };

    try {
        const quoteResults = await yahooFinance.quote(tickers, queryOptions);
        const quotesArray = Array.isArray(quoteResults) ? quoteResults.filter(q => q) : [quoteResults].filter(q => q);

        quotesArray.forEach(quote => {
            if (quote && quote.symbol) {
                results[quote.symbol] = {
                    price: quote.regularMarketPrice,
                    change: quote.regularMarketChange,
                    changePercent: quote.regularMarketChangePercent,
                    volume: quote.regularMarketVolume,
                    marketState: quote.marketState,
                    symbol: quote.symbol,
                    shortName: quote.shortName,
                    timestamp: new Date() // Simplified for now
                };
            }
        });

        tickers.forEach(t => { if (!results[t]) results[t] = null; });
    } catch (error) {
        console.error(`[Yahoo Service] API Error: ${error.message}`);
        tickers.forEach(t => { results[t] = null; });
    }

    return results;
}