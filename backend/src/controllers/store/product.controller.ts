import { Request, Response, NextFunction } from 'express';
import ProductService, { ProductCreateDto, ProductUpdateDto, ProductListQueryOptions } from '../../services/store/product.service';
import { AppError, HttpCode } from '../../utils/appError';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware'; // For admin checks
import mongoose from 'mongoose'; // For ObjectId.isValid

class ProductController {
  // --- Admin Routes ---
  public async createProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Role check should be done by middleware (e.g., isAdmin) before this controller method
      const createDto: ProductCreateDto = req.body;
      // Basic validation (more comprehensive validation can be added here or with a library)
      if (!createDto.name || !createDto.description || createDto.price === undefined || !createDto.category) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Missing required product fields: name, description, price, category.' });
      }
      const product = await ProductService.create(createDto);
      res.status(HttpCode.CREATED).json(product);
    } catch (error) {
      next(error);
    }
  }

  public async updateProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const updateDto: ProductUpdateDto = req.body;
      if (Object.keys(updateDto).length === 0) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'No update data provided.' });
      }
      const product = await ProductService.update(id, updateDto);
      if (!product) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Product not found.' }));
      }
      res.status(HttpCode.OK).json(product);
    } catch (error) {
      next(error);
    }
  }

  public async deleteProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const success = await ProductService.delete(id);
      if (!success) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Product not found or could not be deleted.' }));
      }
      res.status(HttpCode.NO_CONTENT).send();
    } catch (error) {
      next(error);
    }
  }

  // --- Public/User Routes ---
  public async listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const queryOptions: ProductListQueryOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        category: req.query.category as string | undefined,
        tag: req.query.tag as string | undefined,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : true, // Default to active products
        sortBy: req.query.sortBy as ProductListQueryOptions['sortBy'] | undefined,
        sortOrder: req.query.sortOrder as ProductListQueryOptions['sortOrder'] | undefined,
        search: req.query.search as string | undefined,
      };
      // Validate numeric inputs like limit and page
      if (queryOptions.limit !== undefined && (isNaN(queryOptions.limit) || queryOptions.limit <=0)) {
          throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'limit' parameter."});
      }
      if (queryOptions.page !== undefined && (isNaN(queryOptions.page) || queryOptions.page <=0)) {
          throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'page' parameter."});
      }

      const result = await ProductService.findAll(queryOptions);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getProductById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { idOrSlug } = req.params; // Renamed param to idOrSlug
      let product;

      // Try finding by ObjectId first if it's a valid ObjectId format
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
        product = await ProductService.findById(idOrSlug);
      }

      // If not found by ID (or if idOrSlug wasn't a valid ObjectId), try finding by slug
      if (!product) {
         product = await ProductService.findBySlug(idOrSlug);
      }

      if (!product) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Product not found.' }));
      }
      // Ensure only active products are shown unless specifically requested by admin or internal service
      if (!product.isActive) {
          // TODO: Add logic here if admins should see inactive products on this public route
          // For now, if it's inactive, treat as not found for public.
          return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Product not found or is not available.' }));
      }
      res.status(HttpCode.OK).json(product);
    } catch (error) {
      next(error);
    }
  }
}

export default new ProductController();
