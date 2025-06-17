import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import StrategyConfigService, { StrategyConfigCreateDto, StrategyConfigUpdateDto } from '../../services/trading/strategyConfig.service';
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

class StrategyConfigController {
  public async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { name, description, exchangeConfigId, symbol, parameters, isActive } = req.body;

      if (!name || !exchangeConfigId || !symbol || !parameters) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Name, exchangeConfigId, symbol, and parameters are required.' }));
      }
      if (!mongoose.Types.ObjectId.isValid(exchangeConfigId)) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid exchangeConfigId format.' }));
      }
      if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Parameters must be a valid object.' }));
      }

      const createDto: StrategyConfigCreateDto = {
        userId: req.user.id,
        name,
        description,
        exchangeConfigId,
        symbol,
        parameters,
        isActive,
      };
      const result = await StrategyConfigService.create(createDto);
      res.status(HttpCode.CREATED).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getAllForUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const results = await StrategyConfigService.findByUserId(req.user.id);
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
      const result = await StrategyConfigService.findByIdForUser(id, req.user.id);
      if (!result) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Strategy configuration not found.' }));
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
      if (Object.keys(req.body).length === 0) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'No update data provided.' }));
      }
      if (req.body.exchangeConfigId && !mongoose.Types.ObjectId.isValid(req.body.exchangeConfigId)) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid exchangeConfigId format in update data.' }));
      }
       if (req.body.parameters && (typeof req.body.parameters !== 'object' || req.body.parameters === null || Array.isArray(req.body.parameters))) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Parameters must be a valid object if provided for update.' }));
      }

      const updateDto: StrategyConfigUpdateDto = req.body;
      const result = await StrategyConfigService.update(id, req.user.id, updateDto);
      if (!result) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Strategy configuration not found or update failed.' }));
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
      const success = await StrategyConfigService.delete(id, req.user.id);
      if (!success) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Strategy configuration not found or could not be deleted.' }));
      }
      res.status(HttpCode.NO_CONTENT).send();
    } catch (error) {
      next(error);
    }
  }
}

export default new StrategyConfigController();
