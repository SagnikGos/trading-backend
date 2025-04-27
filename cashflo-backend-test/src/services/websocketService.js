// src/services/websocketService.js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken'; // Import jsonwebtoken for auth
import { config } from '../config/index.js';

// Load JWT Secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET;
// Module-level variable to hold the Socket.IO server instance
let io = null;

/**
 * Initializes the Socket.IO server, attaches it to the HTTP server,
 * sets up JWT authentication middleware, and connection/event handling for rooms.
 * @param {http.Server} httpServer - The HTTP server instance from Node's 'http' module.
 */
export function initWebSocketServer(httpServer) {
    // Check if JWT_SECRET is configured
    if (!JWT_SECRET) {
        console.error("--------------------------------------------------------------------");
        console.error("FATAL WARNING: JWT_SECRET is not defined in your .env file!");
        console.error("WebSocket connections will NOT be authenticated.");
        console.error("Define JWT_SECRET in .env for secure WebSocket communication.");
        console.error("--------------------------------------------------------------------");
    }

    // Create the Socket.IO server instance
    io = new Server(httpServer, {
        cors: {
            origin: config.corsOrigins, // Use allowed origins from config
            methods: ["GET", "POST"]
        },
        // Optional: Connection state recovery settings
        /* connectionStateRecovery: {
             maxDisconnectionDuration: 2 * 60 * 1000, // Example: 2 minutes
             skipMiddlewares: true,
        } */
    });

    // --- Socket.IO Authentication Middleware (Runs BEFORE 'connection') ---
    io.use((socket, next) => {
        // Only enforce auth if JWT_SECRET is actually set
        if (!JWT_SECRET) {
            console.warn(`WARN: Allowing unauthenticated WS connection for ${socket.id} (JWT_SECRET not set).`);
            return next(); // Allow connection if secret isn't configured (insecure)
        }

        // Client needs to send token like: io(URL, { auth: { token: 'YOUR_JWT' } })
        const token = socket.handshake.auth?.token;

        if (!token) {
            console.log(`Socket ${socket.id} connection rejected: No token provided.`);
            return next(new Error("Authentication error: No token provided")); // Reject
        }

        // Verify the provided token
        jwt.verify(token, JWT_SECRET, (err, decodedPayload) => {
            if (err) {
                console.log(`Socket ${socket.id} connection rejected: Invalid token (${err.message})`);
                return next(new Error(`Authentication error: ${err.message || 'Invalid token'}`)); // Reject
            }

            // Token is VALID! Attach user info to socket
            socket.user = { id: decodedPayload.userId };
            console.log(`Socket ${socket.id} passed authentication for user ID: ${socket.user.id}`);
            next(); // Allow connection to proceed
        });
    });

    // --- Handle Successfully Authenticated Connections ---
    // The 'connection' event only fires if the io.use() middleware called next() without an error.
    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}, User ID: ${socket.user?.id || 'N/A (Auth Disabled?)'}`);
        // Store subscribed tickers for this specific socket instance
        socket.subscribedTickers = new Set();

        // --- Handle Client Events (Subscribe/Unsubscribe) ---

        socket.on('subscribe', (tickers) => {
            // Use the subscription handler function defined below
            handleSubscription(socket, tickers);
        });

        socket.on('unsubscribe', (tickers) => {
            // Use the unsubscription handler function defined below
            handleUnsubscription(socket, tickers);
        });

        // --- Handle Disconnect and Errors ---

        socket.on('disconnect', (reason) => {
            // Use the disconnect handler function defined below
            handleDisconnection(socket, reason);
        });

        socket.on('error', (error) => {
            console.error(`Socket error (${socket.id}, User ID: ${socket.user?.id || 'N/A'}):`, error);
            // Optionally add cleanup here if needed on socket error
        });

        // --- Send Welcome Message ---
        socket.emit('welcome', { message: `Connected with ID: ${socket.id}. Welcome User ${socket.user?.id || ''}!` });

        // Optional connection state recovery logic could go here...
    });

    console.log('Socket.IO server initialized with JWT auth and room subscription logic.');
} // End of initWebSocketServer


// --- Subscription Handler Functions ---

/**
 * Handles subscription requests from a client by joining them to specific rooms.
 * @param {import('socket.io').Socket} socket - The client's socket instance.
 * @param {string|string[]} tickers - Ticker(s) to subscribe to.
 */
function handleSubscription(socket, tickers) {
  const tickersToJoin = Array.isArray(tickers) ? tickers : [tickers].filter(t => t); // Ensure array and filter null/undefined
  if (tickersToJoin.length === 0) return; // Do nothing if no valid tickers

  console.log(`Socket ${socket.id} (User ${socket.user?.id}) attempting to subscribe to:`, tickersToJoin);
  tickersToJoin.forEach(ticker => {
    if (ticker && typeof ticker === 'string') {
      const roomName = `stock_${ticker}`;
      socket.join(roomName); // Join the Socket.IO room
      socket.subscribedTickers.add(ticker); // Track locally on socket object
      console.log(`Socket ${socket.id} joined room: ${roomName}`);
    } else {
        console.warn(`Invalid ticker format received from ${socket.id}: ${ticker}`);
    }
  });
  // Optional: Send confirmation back to the specific client
  socket.emit('subscribed', tickersToJoin);
}

/**
 * Handles unsubscription requests from a client by leaving specific rooms.
 * @param {import('socket.io').Socket} socket - The client's socket instance.
 * @param {string|string[]} tickers - Ticker(s) to unsubscribe from.
 */
function handleUnsubscription(socket, tickers) {
    const tickersToLeave = Array.isArray(tickers) ? tickers : [tickers].filter(t => t);
    if (tickersToLeave.length === 0) return;

    console.log(`Socket ${socket.id} (User ${socket.user?.id}) attempting to unsubscribe from:`, tickersToLeave);
    tickersToLeave.forEach(ticker => {
        if (ticker && typeof ticker === 'string') {
            const roomName = `stock_${ticker}`;
            socket.leave(roomName); // Leave the Socket.IO room
            socket.subscribedTickers.delete(ticker); // Stop tracking locally
            console.log(`Socket ${socket.id} left room: ${roomName}`);
        } else {
            console.warn(`Invalid ticker format received for unsubscribe from ${socket.id}: ${ticker}`);
        }
    });
    // Optional: Send confirmation back to the specific client
    socket.emit('unsubscribed', tickersToLeave);
}

/**
 * Handles socket disconnection cleanup (if any needed beyond Socket.IO defaults).
 * @param {import('socket.io').Socket} socket - The client's socket instance.
 * @param {string} reason - The reason for disconnection.
 */
function handleDisconnection(socket, reason) {
  console.log(`Socket disconnected: ${socket.id}, User ID: ${socket.user?.id || 'N/A'}, Reason: ${reason}`);
  // Socket.IO automatically handles leaving rooms on disconnect.
  // Add any other application-specific cleanup here if needed.
}


// --- Broadcasting Functions ---

/**
 * Broadcasts stock data updates ONLY to clients subscribed to that specific ticker's room.
 * This is the primary function to be called by server.js's fetch loop in this model.
 * @param {string} ticker - The stock ticker.
 * @param {object} data - The stock data object.
 */
export function broadcastStockUpdate(ticker, data) {
  if (!io) {
    console.error("Socket.IO server not initialized, cannot broadcast update!");
    return;
  }
  if (!ticker || typeof ticker !== 'string') {
      console.error("Invalid ticker provided to broadcastStockUpdate:", ticker);
      return;
  }
  const roomName = `stock_${ticker}`;
  // Send to all sockets in the room 'stock_TICKER'
  io.to(roomName).emit('stock_update', { [ticker]: data });
  // Note: We don't log every broadcast here to avoid excessive logging in the fetch loop
}

/**
 * Broadcasts a message to ALL connected and authenticated clients. Use for global announcements.
 * @param {string} eventName - The name of the event to emit.
 * @param {any} data - The data payload to send.
 */
export function broadcastToAll(eventName, data) {
    if (!io) {
        console.error("Socket.IO server not initialized, cannot broadcast to all!");
        return;
    }
    console.log(`Broadcasting global event '${eventName}' to all authenticated clients.`);
    io.emit(eventName, data); // io.emit() sends to all clients
}