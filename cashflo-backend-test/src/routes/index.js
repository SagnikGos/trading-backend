// src/routes/index.js
import express from 'express';
import stockApiRoutes from './stockApi.js';
import authApiRoutes from './authApi.js'; // <-- Import auth routes
import { authMiddleware } from '../middleware/authMiddleware.js'; // <-- Import JWT middleware

const router = express.Router();

// Mount authentication routes (public)
router.use('/auth', authApiRoutes);

// Mount stock routes (protected by JWT middleware)
// Any route defined in stockApiRoutes will now require a valid JWT
router.use('/stocks', authMiddleware, stockApiRoutes); // Mount under /stocks (or keep at base /)


export default router;