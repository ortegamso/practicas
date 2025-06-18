import { Router } from 'express';
import AnalyticsController from '../../controllers/analytics/analytics.controller';
import { protect } from '../../middlewares/auth.middleware';

const router = Router();

// All analytics routes require authentication for now
router.use(protect);

// GET /api/v1/analytics/pnl - Get PNL for the authenticated user
// Query params: symbol (string), startDate (ISOString), endDate (ISOString)
router.get('/pnl', AnalyticsController.getUserPnl);

// TODO: Add more analytics routes later (e.g., strategy performance, trade history analysis)

export default router;
