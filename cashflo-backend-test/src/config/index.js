// src/config/index.js
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  fetchIntervalMs: parseInt(process.env.FETCH_INTERVAL_MS || '20000', 10),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  // Define allowed origins for Socket.IO/CORS
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ["http://localhost:3000"], // Example for a React frontend dev server
  // Add other config variables here
};