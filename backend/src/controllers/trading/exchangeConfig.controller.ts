import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware'; // To get authenticated user
import ExchangeConfigService, { ExchangeConfigCreateDto, ExchangeConfigUpdateDto } from '../../services/trading/exchangeConfig.service';
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

class ExchangeConfigController {
  public async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { exchangeName, friendlyName, apiKey, apiSecret, apiPassphrase, isTestnet, isActive } = req.body;

      if (!exchangeName || !apiKey || !apiSecret) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Exchange name, API key, and API secret are required.' }));
      }

      const createDto: ExchangeConfigCreateDto = {
        userId: req.user.id, // Assuming req.user.id is a string compatible with ObjectId
        exchangeName,
        friendlyName,
        apiKey,
        apiSecret,
        apiPassphrase,
        isTestnet,
        isActive,
      };
      const result = await ExchangeConfigService.create(createDto);
      res.status(HttpCode.CREATED).json(result);
    } catch (error) {
      next(error); // Pass to global error handler
    }
  }

  public async getAllForUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const results = await ExchangeConfigService.findByUserId(req.user.id);
      res.status(HttpCode.OK).json(results);
    } catch (error) {
      next(error);
    }
  }

  public async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid ID format.' }));
      }
      const result = await ExchangeConfigService.findByIdForUser(id, req.user.id);
      if (!result) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Exchange configuration not found.' }));
      }
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid ID format.' }));
      }
      // Validate that at least one field is being updated
      if (Object.keys(req.body).length === 0) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'No update data provided.' }));
      }

      const updateDto: ExchangeConfigUpdateDto = req.body; // Assuming body contains only valid update fields
      const result = await ExchangeConfigService.update(id, req.user.id, updateDto);
      if (!result) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Exchange configuration not found or update failed.' }));
      }
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { id } = req.params;
       if (!mongoose.Types.ObjectId.isValid(id)) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid ID format.' }));
      }
      const success = await ExchangeConfigService.delete(id, req.user.id);
      if (!success) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Exchange configuration not found or could not be deleted.' }));
      }
      res.status(HttpCode.NO_CONTENT).send(); // Or HttpCode.OK with a success message
    } catch (error) {
      next(error);
    }
  }
}

export default new ExchangeConfigController();
