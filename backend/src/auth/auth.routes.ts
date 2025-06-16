import { Router } from 'express';
import AuthController from './auth.controller';
import { protect, isAdmin } from '../middlewares/auth.middleware'; // Assuming isAdmin is for a future admin-only route

const router = Router();

// --- Public Routes ---
// POST /api/v1/auth/register
router.post('/register', AuthController.register);

// POST /api/v1/auth/login
router.post('/login', AuthController.login);

// --- Protected Routes ---
// GET /api/v1/auth/me (or /profile) - Requires authentication
// The 'protect' middleware will verify JWT and attach user to req.user
router.get('/me', protect, AuthController.getCurrentUser);

// Example of a route restricted to admins
// router.get('/admin-only-data', protect, isAdmin, (req, res) => {
//   res.json({ message: 'Welcome Admin! Here is your admin-only data.' });
// });


// Placeholder for other auth-related routes:
// router.post('/forgot-password', AuthController.forgotPassword);
// router.post('/reset-password/:token', AuthController.resetPassword);
// router.post('/verify-email/:token', AuthController.verifyEmail);
// router.post('/logout', AuthController.logout); // If server-side logout logic is needed

export default router;
