import { Router } from 'express';
import ProductController from '../../controllers/store/product.controller';
import { protect, isAdmin } from '../../middlewares/auth.middleware'; // isAdmin for admin-only routes

const router = Router();

// --- Public Routes (for anyone to view products) ---
// GET /api/v1/store/products - List all active products with pagination, filtering, sorting
router.get('/', ProductController.listProducts);

// GET /api/v1/store/products/:idOrSlug - Get a single product by its ID or slug
router.get('/:idOrSlug', ProductController.getProductById);


// --- Admin-Only Routes (for managing products) ---
// POST /api/v1/store/products - Create a new product
router.post('/', protect, isAdmin, ProductController.createProduct);

// PUT /api/v1/store/products/:id - Update an existing product
router.put('/:id', protect, isAdmin, ProductController.updateProduct);

// DELETE /api/v1/store/products/:id - Delete a product
router.delete('/:id', protect, isAdmin, ProductController.deleteProduct);

export default router;
