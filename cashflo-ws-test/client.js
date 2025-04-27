// client.js
import dotenv from 'dotenv';
import { io } from "socket.io-client";

// Load environment variables from .env file at the very start
dotenv.config();

// --- Configuration ---
const SERVER_URL = process.env.SERVER_URL || "http://localhost:3001"; // Use env var or default
const API_BASE_URL = `${SERVER_URL}/api/stocks`; // Base for stock API calls (should match backend routing)

// Get JWT token from environment variable - CRITICAL for auth
const JWT_TOKEN = process.env.JWT_TOKEN || ""; // Use env var or empty string

// Get initial tickers from env var, split by comma, trim whitespace, filter empty, or use defaults
const initialTickersRaw = process.env.INITIAL_TICKERS || "AAPL,MSFT"; // Default if not set in .env
const initialTickersArray = initialTickersRaw.split(',')
                                            .map(t => t.trim().toUpperCase()) // Standardize to uppercase
                                            .filter(t => t); // Filter out empty strings after trim/split
// Client-side state representing the tickers the user *wants* to watch
let watchedTickers = new Set(initialTickersArray);

// --- Pre-flight Checks ---
// Ensure a JWT token is actually provided in the .env file
if (!JWT_TOKEN || JWT_TOKEN === "PASTE_VALID_JWT_TOKEN_HERE") { // Check placeholder too
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!! FATAL ERROR: JWT_TOKEN is not set or is placeholder in the .env file for the client.");
    console.error("!!! Please log in via the API (e.g., using Postman or curl)");
    console.error("!!! and paste the received token into the client's .env file.");
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    process.exit(1); // Exit if no token is provided, as connection will fail
}
if (initialTickersArray.length === 0) {
    console.warn("Warning: No initial tickers specified in INITIAL_TICKERS environment variable.");
}


// --- Socket Connection ---
console.log(`Attempting to connect to Socket.IO server at ${SERVER_URL}...`);
const socket = io(SERVER_URL, {
    // Send JWT token for authentication during connection handshake
    // Backend's io.use() middleware will verify this
    auth: {
        token: JWT_TOKEN
    },
    // Optional: Configure reconnection behavior
    reconnectionAttempts: 5,
    reconnectionDelay: 3000,
    // transports: ['websocket'] // Optional: you can force only websockets if preferred
});

// --- API Helper ---
// Simple helper function for making authenticated API calls using fetch
async function callApi(endpoint, method = 'GET', body = null) {
    const url = `${API_BASE_URL}${endpoint}`; // Uses /api/stocks base path
    const options = {
        method: method,
        headers: {
            'Authorization': `Bearer ${JWT_TOKEN}`, // Use token from .env
        },
    };
    // Add Content-Type and body only if body is provided
    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    try {
        console.log(`   API Call: ${method} ${url}`, body ? `(Body: ${JSON.stringify(body)})` : '');
        const response = await fetch(url, options);
        // Always try to read the response text for logging or error details
        const responseText = await response.text();

        if (!response.ok) {
            // Throw an error if response status is not in the 200-299 range
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${responseText}`);
        }

        // Handle successful responses (including No Content)
        if (response.status === 204 || responseText.length === 0) {
             console.log(`   API Response: ${response.status} No Content`);
            return { success: true }; // Indicate success for No Content responses
        }
        try {
            // Try to parse JSON, assuming successful responses with content are JSON
            const responseJson = JSON.parse(responseText);
            console.log(`   API Response: ${response.status}`, responseJson);
            // Return success along with the parsed JSON data
            return { success: true, ...responseJson };
        } catch (jsonError) {
            // Handle cases where response is OK (2xx) but not valid JSON
            console.warn(`   API Response: ${response.status} (Non-JSON body)`, responseText);
            return { success: true, raw: responseText }; // Indicate success but provide raw text
        }
    } catch (error) {
        // Catch fetch errors or errors thrown from non-ok responses
        console.error("   API Call Failed:", error.message);
        return { success: false, error: error.message }; // Return a structured error object
    }
}


// --- Core Functions (Call API *before* emitting WS events) ---

async function subscribeToTickers(tickersToSub) {
    // Ensure input is an array of non-empty strings
    const tickersArray = Array.from(tickersToSub).filter(t => t && typeof t === 'string');
    if (tickersArray.length === 0) return;

    // 1. Call API to add/ensure tickers are in the persistent watchlist
    console.log(`--- Ensuring tickers are in DB watchlist: ${tickersArray.join(', ')}`);
    const apiResult = await callApi('/watchlist', 'POST', { tickers: tickersArray });

    if (!apiResult.success) {
        console.error(`   Failed API POST /watchlist: ${apiResult.error}. Still attempting WS subscribe.`);
        // Decide how to handle API failure - here we still try to subscribe via WS
    } else {
        // Log success details from API response if available
        console.log(`   API POST /watchlist Result: ${JSON.stringify(apiResult)}`);
    }

    // 2. If socket is connected, emit WS subscribe event to join rooms
    if (socket.connected) {
        console.log(`>>> Emitting WS 'subscribe' for: ${tickersArray.join(', ')}`);
        socket.emit("subscribe", tickersArray);
        // Add to local client state *after* attempting API call and emit
        tickersArray.forEach(t => watchedTickers.add(t.toUpperCase())); // Store uppercase locally
    } else {
        console.log("   Socket not connected, WS 'subscribe' will happen automatically on next connect event.");
        // Add to local state anyway, so it gets subscribed when connection occurs/recurs
        tickersArray.forEach(t => watchedTickers.add(t.toUpperCase()));
    }
}

async function unsubscribeFromTickers(tickersToUnsub) {
    // Ensure input is an array of non-empty strings
    const tickersArray = Array.from(tickersToUnsub).filter(t => t && typeof t === 'string');
    if (tickersArray.length === 0) return;

    // 1. Call API to remove tickers from persistent watchlist
    console.log(`--- Attempting to remove tickers from DB watchlist: ${tickersArray.join(', ')}`);
    const apiResult = await callApi('/watchlist', 'DELETE', { tickers: tickersArray });

     if (!apiResult.success) {
        console.error(`   Failed API DELETE /watchlist: ${apiResult.error}. Still attempting WS unsubscribe.`);
    } else {
        console.log(`   API DELETE /watchlist Result: ${JSON.stringify(apiResult)}`);
    }

    // 2. If socket is connected, emit WS unsubscribe event to leave rooms
     if (socket.connected) {
        console.log(`>>> Emitting WS 'unsubscribe' for: ${tickersArray.join(', ')}`);
        socket.emit("unsubscribe", tickersArray);
        // Update local state
        tickersArray.forEach(t => watchedTickers.delete(t.toUpperCase()));
    } else {
         console.log("   Socket not connected, cannot emit WS 'unsubscribe'.");
         // Still update local state as the user's intent is to remove
         tickersArray.forEach(t => watchedTickers.delete(t.toUpperCase()));
    }
}


// --- Socket.IO Event Listeners ---

socket.on("connect", () => {
    console.log(`*** Connected successfully! Socket ID: ${socket.id}`);
    // ** Crucial: Subscribe via the function which now includes API call **
    // This ensures DB is updated (if needed) AND socket subscribes on connect/reconnect
    if (watchedTickers.size > 0) {
        console.log("   Ensuring watched tickers are subscribed after connection...");
        // Call subscribe function - no need to await here, let it run
        subscribeToTickers(watchedTickers);
    } else {
         console.log("   No tickers currently in local watch list to subscribe to.");
    }
});

socket.on("disconnect", (reason) => {
    console.warn(`--- Disconnected: ${reason} ---`);
    // Auto-reconnection is handled by socket.io-client based on default options/config
});

socket.on("connect_error", (err) => {
    console.error(`!!! Connection Error: ${err.message} !!!`);
    // Check specifically for authentication errors passed from backend middleware
    if (err.message.includes("Authentication error")) {
        console.error("   Authentication failed. Ensure JWT_TOKEN in .env is valid and not expired.");
        // In a real UI, you might trigger a logout or prompt for login
    }
    // Other errors could be network issues, server unavailable, CORS problems, etc.
});

// Listen for server's welcome message (sent upon successful connection)
socket.on("welcome", (data) => {
    console.log("<<< Server Message (Welcome):", data);
});

// Listen for subscription confirmation from server
socket.on("subscribed", (confirmedTickers) => {
    console.log("<<< Server Message (Subscribed): Confirmed for", confirmedTickers);
});

// Listen for unsubscription confirmation from server
socket.on("unsubscribed", (unsubscribedTickers) => {
    console.log("<<< Server Message (Unsubscribed): Confirmed for", unsubscribedTickers);
});

// Listen for the actual stock updates broadcasted to specific rooms
// Listen for the actual stock updates broadcasted to specific rooms
socket.on("stock_update", (data) => {
    try {
        const ticker = Object.keys(data)[0];
        const update = data[ticker];

        if (ticker && update && watchedTickers.has(ticker)) {
            // --- Format Time ---
            let timeString = 'No Time';
            if (update.timestamp && typeof update.timestamp === 'string') {
                const dateObj = new Date(update.timestamp);
                if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
                    timeString = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                } else {
                    timeString = 'Invalid Time';
                }
            }

            // --- Extract Fields ---
            const price = update.price?.toFixed(2) ?? 'N/A';
            const change = update.change ?? 0;
            const changeStr = change.toFixed(2);
            const changePercent = update.changePercent?.toFixed(2) ?? '0.00';
            const volume = update.volume?.toLocaleString() ?? 'N/A';
            const name = update.shortName || ticker;

            // --- Optional: Add color for positive/negative changes ---
            const colorReset = "\x1b[0m";
            const colorGreen = "\x1b[32m";
            const colorRed = "\x1b[31m";
            const coloredChange = change >= 0 ? `${colorGreen}+${changeStr}${colorReset}` : `${colorRed}${changeStr}${colorReset}`;
            const coloredChangePercent = change >= 0 ? `${colorGreen}+${changePercent}%${colorReset}` : `${colorRed}${changePercent}%${colorReset}`;

            // --- Final Display ---
            console.log(
                `[${timeString}] ${ticker.padEnd(6)} (${name.padEnd(20)}) | ` +
                `Price: $${price.padEnd(8)} | ` +
                `Change: ${coloredChange.padEnd(8)} (${coloredChangePercent}) | ` +
                `Volume: ${volume}`
            );

        } else if (ticker && !watchedTickers.has(ticker)) {
            // Ignore updates for unsubscribed tickers
        }
    } catch (error) {
        console.error("Error handling stock_update:", error.message);
    }
});



// --- Example Usage (Simulate UI actions - keep or remove as needed) ---
// These demonstrate calling the functions which now trigger API calls first
setTimeout(() => {
    console.log("\n--- Simulating User Action: Add GOOG ---");
    subscribeToTickers(["GOOG"]);
}, 1 * 30 * 1000); // 30 seconds

setTimeout(() => {
    console.log("\n--- Simulating User Action: Remove MSFT ---");
    unsubscribeFromTickers(["MSFT"]);
}, 2 * 30 * 1000); // 60 seconds


// --- Initial Log and Keep Alive ---
console.log(`Client script running. Watching initial tickers: ${initialTickersArray.join(', ')}. Waiting for connection... (Press Ctrl+C to exit)`);
// Keep the script running until manually stopped
process.on('SIGINT', () => {
    console.log("\nDisconnecting socket and exiting...");
    socket.disconnect();
    process.exit(0);
});