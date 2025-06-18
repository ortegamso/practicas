import { Router } from 'express';
import MarketplaceController from '../../controllers/marketplace/marketplace.controller';
import ScriptExecutionController from '../../controllers/marketplace/scriptExecution.controller';
import { protect, isAdmin } from '../../middlewares/auth.middleware';

const router = Router();

// --- Public Script Listing & Viewing ---
// GET /api/v1/marketplace/scripts - List all approved and active scripts
router.get('/scripts', MarketplaceController.listPublicScripts);
// GET /api/v1/marketplace/scripts/:idOrSlug - Get a single approved/active script
router.get('/scripts/:idOrSlug', MarketplaceController.getPublicScriptByIdOrSlug);


// --- Author's Script Management (requires authentication) ---
// POST /api/v1/marketplace/my-scripts - Submit a new script
router.post('/my-scripts', protect, MarketplaceController.submitScript);
// GET /api/v1/marketplace/my-scripts - List scripts submitted by the authenticated user
router.get('/my-scripts', protect, MarketplaceController.getMyScripts);
// PUT /api/v1/marketplace/my-scripts/:scriptId - Update a script owned by the authenticated user
router.put('/my-scripts/:scriptId', protect, MarketplaceController.updateMyScript);
// DELETE /api/v1/marketplace/my-scripts/:scriptId - Delete a script owned by the authenticated user
router.delete('/my-scripts/:scriptId', protect, MarketplaceController.deleteMyScript);


// --- Admin Script Management (requires admin privileges) ---
// GET /api/v1/marketplace/admin/scripts - Admin: List all scripts with any status
router.get('/admin/scripts', protect, isAdmin, MarketplaceController.adminGetAllScripts);
// PUT /api/v1/marketplace/admin/scripts/:scriptId - Admin: Update a script (e.g., approve, reject, set feedback)
router.put('/admin/scripts/:scriptId', protect, isAdmin, MarketplaceController.adminUpdateScript);
// DELETE /api/v1/marketplace/admin/scripts/:scriptId - Admin: Delete any script
router.delete('/admin/scripts/:scriptId', protect, isAdmin, MarketplaceController.adminDeleteScript);


// Note: Script execution routes will be separate, e.g., under /script-execution or similar.
// This file handles the marketplace listing and management of scripts.

// --- Script Execution (Test Runs) ---
// POST /api/v1/marketplace/scripts/:scriptIdOrSlug/execute - Test run a script
router.post('/scripts/:scriptIdOrSlug/execute', protect, ScriptExecutionController.executeScript);

export default router;
