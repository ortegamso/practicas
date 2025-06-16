import { Router } from 'express';
import ExchangeConfigController from '../../controllers/trading/exchangeConfig.controller';
import { protect } from '../../middlewares/auth.middleware'; // All these routes should be protected

const router = Router();

// All routes in this file are protected and require authentication
router.use(protect);

// POST /api/v1/trading/exchange-configs
router.post('/', ExchangeConfigController.create);

// GET /api/v1/trading/exchange-configs
router.get('/', ExchangeConfigController.getAllForUser);

// GET /api/v1/trading/exchange-configs/:id
router.get('/:id', ExchangeConfigController.getById);

// PUT /api/v1/trading/exchange-configs/:id
router.put('/:id', ExchangeConfigController.update);

// DELETE /api/v1/trading/exchange-configs/:id
router.delete('/:id', ExchangeConfigController.delete);

export default router;
