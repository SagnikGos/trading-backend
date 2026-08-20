import { prisma } from '../config/database.js';

export async function getPortfolio(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = await prisma.user.findUnique({ where: { userId }, include: { positions: true, orders: { where: { status: 'OPEN' } } } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.status(200).json({ balance: user.balance, positions: user.positions, openOrders: user.orders });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch portfolio' });
    }
}

export async function placeOrder(req, res) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { ticker, type, side, quantity, price } = req.body;
    if (!ticker || !type || !side || !quantity) return res.status(400).json({ error: 'Missing required fields' });
    try {
        const order = await prisma.order.create({
            data: { userId, ticker: ticker.toUpperCase(), type: type.toUpperCase(), side: side.toUpperCase(), quantity: parseInt(quantity), price: price ? parseFloat(price) : null }
        });
        res.status(201).json({ success: true, order });
    } catch (error) {
        res.status(500).json({ error: 'Failed to place order' });
    }
}
