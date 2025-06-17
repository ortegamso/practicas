import { Router } from 'express';
import ReferralController from '../../controllers/referrals/referral.controller';
import { protect, isAdmin } from '../../middlewares/auth.middleware';

const router = Router();

// --- User Authenticated Routes ---
// GET /api/v1/referrals/my-code - Get user's referral code
router.get('/my-code', protect, ReferralController.getMyReferralCode);

// GET /api/v1/referrals/my-commissions - Get commissions for authenticated user
router.get('/my-commissions', protect, ReferralController.getMyCommissions);

// GET /api/v1/referrals/my-directs - Get direct referrals for authenticated user
router.get('/my-directs', protect, ReferralController.getMyDirectReferrals);


// --- Admin-Only Routes ---
// POST /api/v1/referrals/admin/levels - Create or Update a referral level definition
router.post('/admin/levels', protect, isAdmin, ReferralController.setReferralLevel);

// GET /api/v1/referrals/admin/levels - Get all referral level definitions (active and inactive)
router.get('/admin/levels', protect, isAdmin, ReferralController.getReferralLevels);

// POST /api/v1/referrals/admin/process-order/:orderId - Manually trigger commission processing for an order
router.post('/admin/process-order/:orderId', protect, isAdmin, ReferralController.triggerOrderCommissionProcessing);


export default router;
