import { Router } from 'express';
import WalletController from '../../controllers/trading/wallet.controller';
import { protect } from '../../middlewares/auth.middleware';

const router = Router();

router.use(protect); // All wallet routes require authentication

// GET /api/v1/trading/wallets/all - Get all balances for the user from all active configs
router.get('/all', WalletController.getAllWalletBalances);

// GET /api/v1/trading/wallets/:configId - Get balance for a specific exchange configuration
router.get('/:configId', WalletController.getWalletBalanceForExchange);

export default router;
