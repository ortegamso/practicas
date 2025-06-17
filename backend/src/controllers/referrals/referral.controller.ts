import { Request, Response, NextFunction } from 'express';
import ReferralService from '../../services/referrals/referral.service';
import { AppError, HttpCode } from '../../utils/appError';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware'; // For user and admin checks
import { CommissionStatus } from '../../models/mongodb/referralCommission.model';

class ReferralController {
  // --- User Routes ---
  public async getMyReferralCode(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const referralCode = await ReferralService.getUserReferralCode(req.user.id);
      res.status(HttpCode.OK).json({ referralCode });
    } catch (error) {
      next(error);
    }
  }

  public async getMyCommissions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const status = req.query.status as CommissionStatus | undefined;

      if (isNaN(page) || page <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'page' parameter."});
      if (isNaN(limit) || limit <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'limit' parameter."});
      if (status && !Object.values(CommissionStatus).includes(status)) {
        throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'status' parameter."});
      }

      const result = await ReferralService.getUserCommissions(req.user.id, page, limit, status);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getMyDirectReferrals(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      if (isNaN(page) || page <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'page' parameter."});
      if (isNaN(limit) || limit <=0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'limit' parameter."});

      const result = await ReferralService.getUserDirectReferrals(req.user.id, page, limit);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  // --- Admin Routes ---
  public async setReferralLevel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    // Assumes isAdmin middleware has verified user role
    try {
      const { level, commissionPercentage, description, isActive } = req.body;
      if (level === undefined || commissionPercentage === undefined) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Level and commissionPercentage are required.' });
      }
      if (typeof level !== 'number' || level <=0) {
          throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Level must be a positive number.' });
      }
      if (typeof commissionPercentage !== 'number' || commissionPercentage < 0 || commissionPercentage > 100) {
          throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Commission percentage must be a number between 0 and 100.' });
      }

      const result = await ReferralService.setReferralLevel(level, commissionPercentage, description, isActive);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getReferralLevels(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    // Public or admin? For now, let's make it admin to see all, public might see only active via different route.
    // Or, service method itself could differentiate.
    // This is currently wired to an admin route, so using admin service method.
    try {
      const results = await ReferralService.getAllReferralLevelsAdmin();
      res.status(HttpCode.OK).json(results);
    } catch (error) {
      next(error);
    }
  }

  // Placeholder: Trigger commission processing for an order (for testing/manual admin use)
  public async triggerOrderCommissionProcessing(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { orderId } = req.params;
        if (!orderId) {
            throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Order ID is required."});
        }
        await ReferralService.processOrderForCommissions(orderId);
        res.status(HttpCode.OK).json({ message: \`Commission processing triggered for order \${orderId}.\`});
    } catch (error) {
        next(error);
    }
  }
}

export default new ReferralController();
