import { Router } from 'express';
import MarketDataController from '../../controllers/trading/marketData.controller';
import { protect } from '../../middlewares/auth.middleware';

const router = Router();

router.use(protect); // All market data routes require authentication

// Note: :configId refers to the ID of the user's ExchangeConfig document

// GET /api/v1/trading/market-data/:configId/markets - Fetch all markets for a given exchange config
router.get('/:configId/markets', MarketDataController.fetchMarkets);

// GET /api/v1/trading/market-data/:configId/tickers - Fetch all tickers (or specific if symbols query provided)
router.get('/:configId/tickers', MarketDataController.fetchTickers); // e.g., ?symbols=BTC/USDT,ETH/USDT

// GET /api/v1/trading/market-data/:configId/ticker/:symbol - Fetch ticker for a specific symbol
router.get('/:configId/ticker/:symbol', MarketDataController.fetchTicker);

// GET /api/v1/trading/market-data/:configId/orderbook/:symbol - Fetch order book for a specific symbol
router.get('/:configId/orderbook/:symbol', MarketDataController.fetchOrderBook); // e.g., ?limit=20

export default router;
