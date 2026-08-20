import express from 'express';
import { getPortfolio, placeOrder } from '../controllers/tradingController.js';
const router = express.Router();
router.get('/portfolio', getPortfolio);
router.post('/order', placeOrder);
export default router;
