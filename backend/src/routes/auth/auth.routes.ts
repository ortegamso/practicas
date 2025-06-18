import { Router } from 'express';
import AuthController from '../../controllers/auth/auth.controller';
import { protect, isAdmin } from '../../middlewares/auth.middleware'; // Assuming isAdmin is for a future admin-only route

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: User authentication and authorization
 */
const router = Router();

// --- Public Routes ---
// POST /api/v1/auth/register
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             \$ref: '#/components/schemas/UserRegisterRequest'
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Bad request (e.g., validation error, missing fields)
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/BadRequestErrorResponse'
 *       409:
 *         description: Conflict (e.g., user already exists)
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/ErrorResponse' # Generic error for conflict
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/ErrorResponse'
 */router.post('/register', AuthController.register);

// POST /api/v1/auth/login
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in an existing user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             \$ref: '#/components/schemas/UserLoginRequest'
 *     responses:
 *       200:
 *         description: User logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Bad request (e.g., missing fields)
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/BadRequestErrorResponse'
 *       401:
 *         description: Unauthorized (e.g., invalid credentials, account inactive)
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/ErrorResponse'
 */router.post('/login', AuthController.login);

// --- Protected Routes ---
// GET /api/v1/auth/me (or /profile) - Requires authentication
// The 'protect' middleware will verify JWT and attach user to req.user
/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user's profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: [] # Indicates this endpoint uses bearerAuth
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/UserProfileResponse'
 *       401:
 *         description: Unauthorized (e.g., token missing or invalid)
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/ErrorResponse'
 */router.get('/me', protect, AuthController.getCurrentUser);

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
