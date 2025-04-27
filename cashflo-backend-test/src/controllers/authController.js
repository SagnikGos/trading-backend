// src/controllers/authController.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { Prisma } from '@prisma/client';

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10');
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

if (!JWT_SECRET) {
    throw new Error("FATAL ERROR: JWT_SECRET is not defined in .env");
}

export async function registerUser(req, res) {
    const { email, password } = req.body;

    // Basic validation
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) { // Example minimum length
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    try {
        // Hash password
        const hashedPassword = bcrypt.hashSync(password, SALT_ROUNDS);

        // Create user
        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(), // Store email consistently
                passwordHash: hashedPassword,
            },
            select: { userId: true, email: true } // Select only safe fields to return
        });

        res.status(201).json({ message: 'User registered successfully', user: user });

    } catch (error) {
        // Handle potential errors (like duplicate email)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Unique constraint violation (likely email)
             return res.status(409).json({ error: 'Email already exists' });
        }
        console.error('Error during user registration:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
}


export async function loginUser(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' }); // User not found
        }

        // Compare submitted password with stored hash
        const isMatch = bcrypt.compareSync(password, user.passwordHash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' }); // Password mismatch
        }

        // If credentials are valid, generate JWT
        const payload = {
            userId: user.userId,
            // Add other claims if needed (e.g., roles), but keep payload small
        };

        const token = jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Send token back to client
        res.status(200).json({
            message: 'Login successful',
            token: token,
            user: { // Send back some non-sensitive user info
                id: user.userId,
                email: user.email
            }
         });

    } catch (error) {
        console.error('Error during user login:', error);
        res.status(500).json({ error: 'Login failed' });
    }
}
