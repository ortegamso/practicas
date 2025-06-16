import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import ExchangeService from '../../services/trading/exchange.service';
import ExchangeConfigService from '../../services/trading/exchangeConfig.service'; // To verify config ownership/activity
import { AppError, HttpCode } from '../../utils/appError';
import { Market, Ticker } from 'ccxt';

class MarketDataController {
  // Helper to verify config and user
  private async verifyConfig(configId: string, userId: string): Promise<void> {
    const config = await ExchangeConfigService.findByIdForUser(configId, userId);
    if (!config) {
      throw new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Exchange configuration not found or access denied.' });
    }
    if (!config.isActive) {
      throw new AppError({ httpCode: HttpCode.FORBIDDEN, description: 'This exchange configuration is currently inactive.' });
    }
  }

  public async fetchMarkets(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { configId } = req.params; // The ID of the ExchangeConfig document

      await this.verifyConfig(configId, req.user.id);

      const markets: Market[] = await ExchangeService.fetchMarkets(configId, req.user.id);
      res.status(HttpCode.OK).json(markets);
    } catch (error) {
      next(error);
    }
  }

  public async fetchTicker(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { configId, symbol } = req.params;

      if (!symbol) {
          return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Symbol parameter is required.'}));
      }

      await this.verifyConfig(configId, req.user.id);

      const ticker: Ticker = await ExchangeService.fetchTicker(configId, req.user.id, symbol.toUpperCase());
      res.status(HttpCode.OK).json(ticker);
    } catch (error) {
      next(error);
    }
  }

  public async fetchTickers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { configId } = req.params;
      // req.query.symbols should be a comma-separated string of symbols if provided
      const symbolsQuery = req.query.symbols as string | undefined;
      let symbolsArray: string[] | undefined;

      if (symbolsQuery) {
        symbolsArray = symbolsQuery.split(',').map(s => s.trim().toUpperCase());
        if (symbolsArray.some(s => !s)) {
             return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid symbols format. Ensure symbols are comma-separated and not empty.'}));
        }
      }

      await this.verifyConfig(configId, req.user.id);

      const tickers: { [symbol: string]: Ticker } = await ExchangeService.fetchTickers(configId, req.user.id, symbolsArray);
      res.status(HttpCode.OK).json(tickers);
    } catch (error) {
      next(error);
    }
  }

  public async fetchOrderBook(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { configId, symbol } = req.params;
      const limitQuery = req.query.limit as string | undefined;
      let limit: number | undefined;

      if (!symbol) {
        return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Symbol parameter is required.' }));
      }
      if (limitQuery) {
        limit = parseInt(limitQuery, 10);
        if (isNaN(limit) || limit <= 0) {
          return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid limit parameter. Must be a positive integer.' }));
        }
      }

      await this.verifyConfig(configId, req.user.id);

      const orderBook = await ExchangeService.fetchOrderBook(configId, req.user.id, symbol.toUpperCase(), limit);
      res.status(HttpCode.OK).json(orderBook);
    } catch (error) {
      next(error);
    }
  }
}

export default new MarketDataController();
