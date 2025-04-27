// src/config/database.js
import { PrismaClient } from '@prisma/client';

// Instantiate Prisma Client (singleton pattern)
const prisma = new PrismaClient({
    // Optional: logging configuration
    // log: ['query', 'info', 'warn', 'error'],
});

// Optional: Add connection event listeners if needed (less common than with pools)
// Prisma handles connection pooling internally.

// Graceful shutdown hook (important!)
async function disconnectPrisma() {
    try {
        await prisma.$disconnect();
        console.log('Prisma Client disconnected.');
    } catch (e) {
        console.error('Error disconnecting Prisma Client:', e);
        process.exit(1); // Exit if Prisma can't disconnect gracefully
    }
}

// Export the client instance and the disconnect function
export { prisma, disconnectPrisma };