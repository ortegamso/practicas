import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import AnalyticsService from '../../services/analytics/analytics.service';
import { AppError, HttpCode } from '../../utils/appError';

class AnalyticsController {
  public async getUserPnl(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }

      const userId = req.user.id;
      const { symbol, startDate, endDate } = req.query;

      // Basic validation for date formats if provided
      let parsedStartDate: Date | undefined;
      let parsedEndDate: Date | undefined;
      if (startDate && typeof startDate === 'string') {
        parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
          return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid startDate format. Use ISO 8601.' }));
        }
      }
      if (endDate && typeof endDate === 'string') {
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedEndDate.getTime())) {
          return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid endDate format. Use ISO 8601.' }));
        }
      }
      if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
          return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'startDate cannot be after endDate.' }));
      }


      const pnlResult = await AnalyticsService.calculateUserPnl(
        userId,
        symbol as string | undefined,
        parsedStartDate,
        parsedEndDate
      );

      if (!pnlResult) {
        // This case might occur if service decides to return null for "no data" instead of zero PNL object
        // For now, service returns zero PNL object, so this might not be hit.
        res.status(HttpCode.OK).json({ message: 'No PNL data available for the given criteria.' });
        return;
      }

      res.status(HttpCode.OK).json(pnlResult);
    } catch (error) {
      next(error);
    }
  }
}

export default new AnalyticsController();
