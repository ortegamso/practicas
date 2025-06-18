import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import ScriptRunnerService, { RunMarketplaceScriptRequest } from '../../services/marketplace/scriptRunner.service';
import { AppError, HttpCode } from '../../utils/appError';

class ScriptExecutionController {
  public async executeScript(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User not authenticated.' }));
      }
      const { scriptIdOrSlug } = req.params;
      const { inputData, executionTimeoutMs } = req.body;

      if (!scriptIdOrSlug) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Script identifier (ID or slug) is required in the path.' });
      }

      const runRequest: RunMarketplaceScriptRequest = {
        scriptIdOrSlug,
        userId: req.user.id,
        inputData: inputData || {}, // Default to empty object if no input data
        executionTimeoutMs: executionTimeoutMs ? parseInt(executionTimeoutMs as string, 10) : undefined,
      };

      if (runRequest.executionTimeoutMs !== undefined && isNaN(runRequest.executionTimeoutMs)) {
          throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid executionTimeoutMs format. Must be a number.' });
      }


      console.log(\`[API] Received request to execute script: \${scriptIdOrSlug} by user \${req.user.id}\`);
      const result = await ScriptRunnerService.runScript(runRequest);

      // Depending on the result (success, error, timeout), status code might vary.
      // For now, if service doesn't throw, assume 200 OK and client inspects payload.
      res.status(HttpCode.OK).json(result);

    } catch (error) {
      // Log the full error for debugging if it's not an AppError already
      // if (!(error instanceof AppError)) {
      //   console.error("[ScriptExecutionController] Unexpected error:", error);
      // }
      next(error); // Pass to global error handler
    }
  }
}

export default new ScriptExecutionController();
