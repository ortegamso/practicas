import { Request, Response, NextFunction } from 'express';
import MarketplaceService, { ScriptCreateDto, ScriptUpdateDto, ScriptAdminUpdateDto, ScriptListQueryOptions } from '../../services/marketplace/marketplace.service';
import { AppError, HttpCode } from '../../utils/appError';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { ScriptApprovalStatus } from '../../models/mongodb/script.model'; // For validation
import mongoose from 'mongoose';

class MarketplaceController {
  // --- Author Routes ---
  public async submitScript(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { name, description, language, code, version, price, currency, tags, category, longDescription } = req.body;

      // Basic validation
      if (!name || !description || !language || !code || !version || !category) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Missing required fields: name, description, language, code, version, category.' });
      }
      // TODO: Add more specific validation for language, category enums, version format, price etc.

      const createDto: ScriptCreateDto = {
        authorId: req.user.id,
        name, description, longDescription, language, code, version,
        price: price === undefined ? 0 : Number(price),
        currency: currency || 'USD',
        tags, category
      };
      const script = await MarketplaceService.submitScript(createDto);
      res.status(HttpCode.CREATED).json(script);
    } catch (error) {
      next(error);
    }
  }

  public async updateMyScript(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { scriptId } = req.params;
      const updateDto: ScriptUpdateDto = req.body;
      if (Object.keys(updateDto).length === 0) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'No update data provided.' });
      }

      const updatedScript = await MarketplaceService.updateMyScript(scriptId, req.user.id, updateDto);
      if (!updatedScript) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Script not found or you do not own this script.' }));
      }
      res.status(HttpCode.OK).json(updatedScript);
    } catch (error) {
      next(error);
    }
  }

  public async getMyScripts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user) {
            return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
        }
        const queryOptions: ScriptListQueryOptions = {
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
            page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
            category: req.query.category as string | undefined,
            language: req.query.language as string | undefined,
            approvalStatus: req.query.approvalStatus as ScriptApprovalStatus | undefined,
            isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
            sortBy: req.query.sortBy as ScriptListQueryOptions['sortBy'] | undefined,
            sortOrder: req.query.sortOrder as ScriptListQueryOptions['sortOrder'] | undefined,
            authorId: req.user.id, // Filter by current user
        };
        const result = await MarketplaceService.findScripts(queryOptions);
        res.status(HttpCode.OK).json(result);
    } catch (error) {
        next(error);
    }
  }

  public async deleteMyScript(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        if (!req.user) {
            return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
        }
        const { scriptId } = req.params;
        const success = await MarketplaceService.deleteMyScript(scriptId, req.user.id);
        if (!success) {
            return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Script not found, you do not own this script, or it cannot be deleted.' }));
        }
        res.status(HttpCode.NO_CONTENT).send();
    } catch (error) {
        next(error);
    }
  }


  // --- Public Routes ---
  public async listPublicScripts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const queryOptions: ScriptListQueryOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        category: req.query.category as string | undefined,
        language: req.query.language as string | undefined,
        tag: req.query.tag as string | undefined,
        sortBy: (req.query.sortBy as ScriptListQueryOptions['sortBy']) || 'publishedAt', // Default sort for public
        sortOrder: (req.query.sortOrder as ScriptListQueryOptions['sortOrder']) || 'desc',
        search: req.query.search as string | undefined,
        isActive: true, // Only active scripts
        approvalStatus: ScriptApprovalStatus.APPROVED, // Only approved scripts
      };
      // Validate numeric inputs
      if (isNaN(queryOptions.limit!)) queryOptions.limit = 10;
      if (isNaN(queryOptions.page!)) queryOptions.page = 1;

      const result = await MarketplaceService.findScripts(queryOptions);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getPublicScriptByIdOrSlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { idOrSlug } = req.params;
      const script = await MarketplaceService.findScriptByIdOrSlug(idOrSlug);
      if (!script || !script.isActive || script.approvalStatus !== ScriptApprovalStatus.APPROVED) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Script not found or not available.' }));
      }
      res.status(HttpCode.OK).json(script);
    } catch (error) {
      next(error);
    }
  }

  // --- Admin Routes ---
  public async adminGetAllScripts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const queryOptions: ScriptListQueryOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        category: req.query.category as string | undefined,
        language: req.query.language as string | undefined,
        authorId: req.query.authorId as string | undefined,
        approvalStatus: req.query.approvalStatus as ScriptApprovalStatus | undefined,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        sortBy: (req.query.sortBy as ScriptListQueryOptions['sortBy']) || 'createdAt',
        sortOrder: (req.query.sortOrder as ScriptListQueryOptions['sortOrder']) || 'desc',
        search: req.query.search as string | undefined,
      };
      const result = await MarketplaceService.findScripts(queryOptions);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async adminUpdateScript(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { scriptId } = req.params;
      const adminUpdateDto: ScriptAdminUpdateDto = req.body;
      if (Object.keys(adminUpdateDto).length === 0) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'No update data provided.' });
      }
      // TODO: Validate adminUpdateDto fields, e.g. approvalStatus against enum

      const updatedScript = await MarketplaceService.updateScriptByAdmin(scriptId, adminUpdateDto);
      if (!updatedScript) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Script not found.' }));
      }
      res.status(HttpCode.OK).json(updatedScript);
    } catch (error) {
      next(error);
    }
  }

  public async adminDeleteScript(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { scriptId } = req.params;
        const success = await MarketplaceService.deleteScriptByAdmin(scriptId);
        if (!success) {
            return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Script not found or could not be deleted.' }));
        }
        res.status(HttpCode.NO_CONTENT).send();
    } catch (error) {
        next(error);
    }
  }
}

export default new MarketplaceController();
