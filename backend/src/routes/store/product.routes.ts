import { Router } from 'express';
import ProductController from '../../controllers/store/product.controller';
import { protect, isAdmin } from '../../middlewares/auth.middleware'; // isAdmin for admin-only routes

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: E-commerce product management and browsing
 */
const router = Router();

// --- Public Routes (for anyone to view products) ---
// GET /api/v1/store/products - List all active products with pagination, filtering, sorting
/**
 * @swagger
 * /store/products:
 *   get:
 *     summary: List all active products
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of products to return per page.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter products by category slug/name.
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Filter products by tag.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [price, createdAt, name, publishedAt]
 *           default: publishedAt
 *         description: Field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order.
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for product name, description, or tags.
 *     responses:
 *       200:
 *         description: A list of products.
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/ProductListResponse' # Defined in swagger.config.ts
 *       400:
 *         description: Bad request (e.g., invalid query parameters)
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/BadRequestErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/ErrorResponse'
 */router.get('/', ProductController.listProducts);

// GET /api/v1/store/products/:idOrSlug - Get a single product by its ID or slug
/**
 * @swagger
 * /store/products/{idOrSlug}:
 *   get:
 *     summary: Get a single product by its ID or slug
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: idOrSlug
 *         required: true
 *         schema:
 *           type: string
 *         description: The MongoDB ObjectId or the URL-friendly slug of the product.
 *     responses:
 *       200:
 *         description: Detailed information about the product.
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/Product' # Defined in swagger.config.ts
 *       404:
 *         description: Product not found or not available.
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/ErrorResponse'
 */router.get('/:idOrSlug', ProductController.getProductById);


// --- Admin-Only Routes (for managing products) ---
// POST /api/v1/store/products - Create a new product
/**
 * @swagger
 * /store/products:
 *   post:
 *     summary: Create a new product (Admin only)
 *     tags: [Products, Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object # Define ProductCreateDto inline or ref global schema
 *             required: [name, description, price, category]
 *             properties:
 *               name: { type: 'string', example: 'New Awesome Bot' }
 *               description: { type: 'string', example: 'This bot does amazing things.' }
 *               longDescription: { type: 'string', example: 'More details about the bot...' }
 *               price: { type: 'number', format: 'float', example: 199.99 }
 *               currency: { type: 'string', example: 'USD', default: 'USD' }
 *               category: { type: 'string', example: 'trading_bot' } # Ref ProductCatergory enum
 *               tags: { type: 'array', items: { type: 'string' }, example: ['new', 'beta'] }
 *               stock: { type: 'integer', nullable: true, example: 50 }
 *               images: { type: 'array', items: { type: 'string', format: 'url' }, example: ['https://example.com/newbot.jpg'] }
 *               isActive: { type: 'boolean', default: true }
 *     responses:
 *       201:
 *         description: Product created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/Product'
 *       400:
 *         description: Bad request (e.g., validation error).
 *         content:
 *           application/json:
 *             schema:
 *               \$ref: '#/components/schemas/BadRequestErrorResponse'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden (user is not an admin).
 *       409:
 *         description: Conflict (e.g., product with same name/slug already exists).
 *       500:
 *         description: Internal server error.
 */router.post('/', protect, isAdmin, ProductController.createProduct);

// PUT /api/v1/store/products/:id - Update an existing product
router.put('/:id', protect, isAdmin, ProductController.updateProduct);

// DELETE /api/v1/store/products/:id - Delete a product
router.delete('/:id', protect, isAdmin, ProductController.deleteProduct);

export default router;
