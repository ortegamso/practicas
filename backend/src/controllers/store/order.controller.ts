import { Request, Response, NextFunction } from 'express';
import OrderService, { OrderCreateDto, OrderUpdateDto } from '../../services/store/order.service';
import { AppError, HttpCode } from '../../utils/appError';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware'; // For user and admin checks
import mongoose from 'mongoose';

class OrderController {
  // --- User Routes ---
  public async createOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { items, currency, shippingAddress } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Order items are required and must be an array.' });
      }
      // Further validation for item structure (productId, quantity) can be done here or in service
      for (const item of items) {
          if (!item.productId || !item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
              throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Each order item must have a valid productId and a positive quantity.'});
          }
          if (!mongoose.Types.ObjectId.isValid(item.productId)) {
             throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: \`Invalid productId format: \${item.productId}.\`});
          }
      }

      const createDto: OrderCreateDto = {
        userId: req.user.id,
        items,
        currency,
        shippingAddress,
      };
      const order = await OrderService.create(createDto);
      res.status(HttpCode.CREATED).json(order);
    } catch (error) {
      next(error);
    }
  }

  public async getUserOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      if (isNaN(page) || page <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'page' parameter."});
      if (isNaN(limit) || limit <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'limit' parameter."});

      const result = await OrderService.findUserOrders(req.user.id, page, limit);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getUserOrderById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { id: orderIdParam } = req.params; // Can be MongoDB ObjectId or custom OrderID string
      const order = await OrderService.findOrderByIdForUser(orderIdParam, req.user.id);
      if (!order) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Order not found.' }));
      }
      res.status(HttpCode.OK).json(order);
    } catch (error) {
      next(error);
    }
  }

  // --- Admin Routes ---
  public async getAllOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    // Assumes isAdmin middleware has already verified user role
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const status = req.query.status as string | undefined;
      if (isNaN(page) || page <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'page' parameter."});
      if (isNaN(limit) || limit <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'limit' parameter."});

      const result = await OrderService.findAllOrders(page, limit, status);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getOrderByIdAsAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: orderIdParam } = req.params;
      const order = await OrderService.findOrderByIdAsAdmin(orderIdParam);
      if (!order) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Order not found.' }));
      }
      res.status(HttpCode.OK).json(order);
    } catch (error) {
      next(error);
    }
  }

  public async updateOrderStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: orderIdParam } = req.params;
      const { status, adminNotes } = req.body;
      if (!status) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'New status is required.' });
      }
      // TODO: Validate 'status' against OrderStatus enum values

      const order = await OrderService.updateOrderStatus(orderIdParam, status, adminNotes);
      if (!order) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Order not found or status update failed.' }));
      }
      res.status(HttpCode.OK).json(order);
    } catch (error) {
      next(error);
    }
  }
}

export default new OrderController();
