// src/config/redisClient.js
import Redis from 'ioredis';
import { config } from './index.js';

const redisClient = new Redis(config.redisUrl);

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
  // Implement reconnection logic or crash prevention if Redis is critical
});

// Optional: Explicitly connect if ioredis doesn't auto-connect as desired
// await redisClient.connect().catch(console.error);

export default redisClient;