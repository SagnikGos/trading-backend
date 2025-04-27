// src/middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
// import { prisma } from '../config/database.js'; // Optional: if you need to check DB for user existence

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET is not defined. Auth middleware will not work.");
    // Optionally throw an error to prevent server start without a secret
    // throw new Error("FATAL ERROR: JWT_SECRET is not defined.");
}

export async function authMiddleware(req, res, next) {
    // 1. Get token from header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    if (!JWT_SECRET) {
         console.error("Auth middleware cannot verify token: JWT_SECRET not configured.");
         return res.status(500).json({ error: "Server configuration error" });
    }

    try {
        // 2. Verify token
        const decodedPayload = jwt.verify(token, JWT_SECRET);

        // 3. Attach user ID (and potentially other payload data) to request object
        // We trust the userId from the verified token payload
        req.user = {
            id: decodedPayload.userId
            // You could add other fields from the payload here if needed
        };

        // Optional: Verify user still exists in DB? (adds overhead but increases security)
        
        // const user = await prisma.user.findUnique({ where: { userId: req.user.id } });
        // if (!user) {
        //     return res.status(401).json({ error: 'Unauthorized: User not found' });
        // }
        // Attach full user object if needed (excluding password)
        // req.user = { id: user.userId, email: user.email, ... };
       

        console.log(`JWT Authenticated request for user ID: ${req.user.id}`);
        next(); // Proceed to the protected route

    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: 'Unauthorized: Token expired' });
        } else if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        } else {
            console.error("Error during token verification:", error);
            return res.status(500).json({ error: 'Internal server error during authentication' });
        }
    }
}