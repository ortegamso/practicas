import { Router } from 'express';
import OrderController from '../../controllers/store/order.controller';
import { protect, isAdmin } from '../../middlewares/auth.middleware';

const router = Router();

// --- User Authenticated Routes ---
// POST /api/v1/store/orders - Create a new order by authenticated user
router.post('/', protect, OrderController.createOrder);

// GET /api/v1/store/orders - Get order history for authenticated user
router.get('/', protect, OrderController.getUserOrders);

// GET /api/v1/store/orders/:id - Get a specific order by ID for authenticated user
router.get('/:id', protect, OrderController.getUserOrderById);


// --- Admin-Only Routes ---
// GET /api/v1/store/orders/admin/all - Get all orders (admin view)
router.get('/admin/all', protect, isAdmin, OrderController.getAllOrders);

// GET /api/v1/store/orders/admin/:id - Get a specific order by ID (admin view)
router.get('/admin/:id', protect, isAdmin, OrderController.getOrderByIdAsAdmin);

// PUT /api/v1/store/orders/admin/:id/status - Update order status (admin)
router.put('/admin/:id/status', protect, isAdmin, OrderController.updateOrderStatus);


export default router;
