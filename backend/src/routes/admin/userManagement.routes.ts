import { Router } from 'express';
import UserManagementController from '../../controllers/admin/userManagement.controller';
import { protect, isAdmin } from '../../middlewares/auth.middleware';

const router = Router();

// All routes in this file are protected and require admin privileges
router.use(protect);
router.use(isAdmin); // Ensure only admins can access these

// GET /api/v1/admin/users - List all users (paginated, filterable)
router.get('/users', UserManagementController.listUsers);

// GET /api/v1/admin/users/:userId - Get a specific user's details
router.get('/users/:userId', UserManagementController.getUserById);

// PUT /api/v1/admin/users/:userId - Update a user's details (roles, isActive, etc.)
router.put('/users/:userId', UserManagementController.updateUser);

// PATCH /api/v1/admin/users/:userId/status - Activate/deactivate a user
router.patch('/users/:userId/status', UserManagementController.setUserActiveStatus);


export default router;
