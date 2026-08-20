import { prisma } from '../config/database.js';

export async function processTicks(stockData) {
    if (!stockData) return;
    for (const [ticker, data] of Object.entries(stockData)) {
        if (!data || !data.price) continue;
        const currentPrice = data.price;

        // Find all OPEN limit/market orders for this ticker
        const openOrders = await prisma.order.findMany({
            where: { ticker, status: 'OPEN' }
        });

        for (const order of openOrders) {
            let execute = false;
            if (order.type === 'MARKET') {
                execute = true;
            } else if (order.type === 'LIMIT') {
                if (order.side === 'BUY' && currentPrice <= order.price) {
                    execute = true;
                } else if (order.side === 'SELL' && currentPrice >= order.price) {
                    execute = true;
                }
            }

            if (execute) {
                await executeOrder(order, currentPrice);
            }
        }
    }
}

async function executeOrder(order, executionPrice) {
    const totalCost = executionPrice * order.quantity;

    try {
        await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { userId: order.userId } });
            if (!user) throw new Error('User not found');

            // Check balance/position
            if (order.side === 'BUY' && user.balance < totalCost) {
                await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
                return;
            }

            let position = await tx.position.findUnique({
                where: { userId_ticker: { userId: order.userId, ticker: order.ticker } }
            });

            if (order.side === 'SELL') {
                if (!position || position.quantity < order.quantity) {
                    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
                    return;
                }
            }

            // Execute
            if (order.side === 'BUY') {
                await tx.user.update({ where: { userId: order.userId }, data: { balance: user.balance - totalCost } });
                if (position) {
                    const newQty = position.quantity + order.quantity;
                    const newAvg = ((position.quantity * position.avgPrice) + totalCost) / newQty;
                    await tx.position.update({ where: { id: position.id }, data: { quantity: newQty, avgPrice: newAvg } });
                } else {
                    await tx.position.create({ data: { userId: order.userId, ticker: order.ticker, quantity: order.quantity, avgPrice: executionPrice } });
                }
            } else {
                await tx.user.update({ where: { userId: order.userId }, data: { balance: user.balance + totalCost } });
                const newQty = position.quantity - order.quantity;
                if (newQty === 0) {
                    await tx.position.delete({ where: { id: position.id } });
                } else {
                    await tx.position.update({ where: { id: position.id }, data: { quantity: newQty } });
                }
            }

            await tx.order.update({ where: { id: order.id }, data: { status: 'FILLED', price: executionPrice } });
            console.log(`[Trading Engine] Order ${order.id} FILLED for User ${order.userId} (${order.side} ${order.quantity} ${order.ticker} @ ${executionPrice})`);
        });
    } catch (e) {
        console.error(`[Trading Engine] Failed to execute order ${order.id}:`, e);
    }
}
