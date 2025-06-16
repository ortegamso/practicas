import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import ExchangeService from '../../services/trading/exchange.service';
import ExchangeConfigService from '../../services/trading/exchangeConfig.service';
import { AppError, HttpCode } from '../../utils/appError';
import { Balances } from 'ccxt';

interface WalletBalanceResponse {
  exchangeConfigId: string;
  exchangeName: string;
  friendlyName?: string;
  isTestnet: boolean;
  balances: Balances | null; // CCXT Balances object or null if error for this specific exchange
  error?: string; // Error message if fetching balance for this specific exchange failed
}

class WalletController {
  public async getAllWalletBalances(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }

      // 1. Get all active exchange configurations for the user
      const exchangeConfigs = await ExchangeConfigService.findByUserId(req.user.id);
      const activeConfigs = exchangeConfigs.filter(config => config.isActive);

      if (activeConfigs.length === 0) {
        res.status(HttpCode.OK).json({
          message: 'No active exchange configurations found. Add and activate configurations to see balances.',
          wallets: [],
        });
        return;
      }

      // 2. For each active configuration, fetch balances
      const walletPromises = activeConfigs.map(async (config): Promise<WalletBalanceResponse> => {
        try {
          // Ensure config.id is valid (it should be if coming from service)
          const balances = await ExchangeService.fetchBalance(config.id, req.user!.id); // user is checked above
          return {
            exchangeConfigId: config.id,
            exchangeName: config.exchangeName,
            friendlyName: config.friendlyName,
            isTestnet: config.isTestnet,
            balances,
          };
        } catch (error: any) {
          console.error(\`Error fetching balance for config \${config.id} (\${config.exchangeName}):\`, error.message);
          return {
            exchangeConfigId: config.id,
            exchangeName: config.exchangeName,
            friendlyName: config.friendlyName,
            isTestnet: config.isTestnet,
            balances: null,
            error: error.message || 'Failed to fetch balance for this exchange.',
          };
        }
      });

      const walletResults = await Promise.all(walletPromises);

      res.status(HttpCode.OK).json({
        message: 'Aggregated wallet balances retrieved.',
        wallets: walletResults,
      });

    } catch (error) {
      // This catches errors from ExchangeConfigService.findByUserId or other unexpected errors
      next(error);
    }
  }

  public async getWalletBalanceForExchange(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user) {
            return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
        }
        const { configId } = req.params; // ID of the specific ExchangeConfig document

        // Optional: Validate configId format if needed, though service will handle not found
        // if (!mongoose.Types.ObjectId.isValid(configId)) {
        //   return next(new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid configuration ID format.' }));
        // }

        // Fetch the specific config to ensure it belongs to the user and to get its details
        const config = await ExchangeConfigService.findByIdForUser(configId, req.user.id);
        if (!config) {
            return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Exchange configuration not found or access denied.' }));
        }
        if (!config.isActive) {
             return next(new AppError({ httpCode: HttpCode.FORBIDDEN, description: 'This exchange configuration is currently inactive.' }));
        }

        const balances = await ExchangeService.fetchBalance(configId, req.user.id);

        const response: WalletBalanceResponse = {
            exchangeConfigId: config.id,
            exchangeName: config.exchangeName,
            friendlyName: config.friendlyName,
            isTestnet: config.isTestnet,
            balances,
        };
        res.status(HttpCode.OK).json(response);

    } catch (error) {
        next(error);
    }
  }
}

export default new WalletController();
