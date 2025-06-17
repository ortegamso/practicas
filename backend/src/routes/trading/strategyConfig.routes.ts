import { Router } from 'express';
import StrategyConfigController from '../../controllers/trading/strategyConfig.controller';
import { protect } from '../../middlewares/auth.middleware';

const router = Router();

router.use(protect); // All strategy config routes require authentication

// POST /api/v1/trading/strategy-configs
router.post('/', StrategyConfigController.create);

// GET /api/v1/trading/strategy-configs
router.get('/', StrategyConfigController.getAllForUser);

// GET /api/v1/trading/strategy-configs/:id
router.get('/:id', StrategyConfigController.getById);

// PUT /api/v1/trading/strategy-configs/:id
router.put('/:id', StrategyConfigController.update);

// DELETE /api/v1/trading/strategy-configs/:id
router.delete('/:id', StrategyConfigController.delete);

export default router;
