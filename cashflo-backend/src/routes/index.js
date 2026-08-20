// src/routes/index.js
import express from 'express';
import stockApiRoutes from './stockApi.js';
import authApiRoutes from './authApi.js'; // <-- Import auth routes
import { authMiddleware } from '../middleware/authMiddleware.js'; // <-- Import JWT middleware

import tradingApiRoutes from './tradingApi.js';

const router = express.Router();

// Mount authentication routes (public)
router.use('/auth', authApiRoutes);

// Mount stock routes (protected by JWT middleware)
router.use('/stocks', authMiddleware, stockApiRoutes);

// Mount trading routes
router.use('/trading', authMiddleware, tradingApiRoutes);

export default router;