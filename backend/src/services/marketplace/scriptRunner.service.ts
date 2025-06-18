import MarketplaceService from './marketplace.service'; // To fetch script details
import SandboxExecutionService, { ScriptExecutionRequest, ScriptExecutionResult } from '../sandbox/sandbox.service';
import { IMarketplaceScript, ScriptApprovalStatus } from '../../models/mongodb/script.model';
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

export interface RunMarketplaceScriptRequest {
  scriptIdOrSlug: string;
  userId: string | mongoose.Types.ObjectId; // User initiating the run
  inputData?: any; // Custom input data for this run
  // executionMode: 'test' | 'live_testnet' | 'live_real'; // For later, to determine data source etc.
  // exchangeConfigId?: string; // If running against a specific user exchange config (for live modes)
  executionTimeoutMs?: number; // Override default sandbox timeout
}

export interface ScriptRunResponse extends ScriptExecutionResult {
  scriptId: string;
  scriptName: string;
  scriptVersion: string;
  // Potentially add performance metrics or backtesting results here later
}

class ScriptRunnerService {
  public async runScript(request: RunMarketplaceScriptRequest): Promise<ScriptRunResponse> {
    const { scriptIdOrSlug, userId, inputData, executionTimeoutMs } = request;

    // 1. Fetch the script details from MarketplaceService
    // We need to ensure the user has rights to run this script
    // - If it's their own script, they can always run/test it.
    // - If it's a public/purchased script, different rules might apply.
    // For now, let's assume if they can fetch it via MarketplaceService, they can try to run it.
    // More granular access control (e.g., checking purchases) would be added later.

    const script: IMarketplaceScript | null = await MarketplaceService.findScriptByIdOrSlug(scriptIdOrSlug);

    if (!script) {
      throw new AppError({ httpCode: HttpCode.NOT_FOUND, description: \`Script '\${scriptIdOrSlug}' not found.\` });
    }

    // --- Permission Checks (Basic examples) ---
    // Is the script owned by the user?
    const isAuthor = script.author.toString() === userId.toString();

    // Is the script approved and active for public execution?
    const isPubliclyExecutable = script.isActive && script.approvalStatus === ScriptApprovalStatus.APPROVED;

    if (!isAuthor && !isPubliclyExecutable) {
        // If not author and script is not approved & active for public, deny execution.
        // (This check might be more nuanced based on whether user "purchased" a non-active but approved script, etc.)
        throw new AppError({ httpCode: HttpCode.FORBIDDEN, description: \`You do not have permission to run this script, or it is not currently available for execution.\` });
    }

    // TODO: For 'live_testnet' or 'live_real' modes, would need to:
    // - Fetch exchange API keys for the user (from ExchangeConfigService)
    // - Potentially pass these securely to the sandbox or have the sandbox request them via a secure callback.
    // - This is complex and security-sensitive. For now, focus on 'test' mode with mock/inputData.

    console.log(\`[ScriptRunner] Preparing to run script: \${script.name} (v\${script.version}), ID: \${script.id} for user \${userId}\`);

    // 2. Prepare execution request for SandboxService
    const sandboxRequest: ScriptExecutionRequest = {
      scriptCode: script.code,
      language: script.language as string, // Assuming script.language matches sandbox expectations
      inputData: inputData || {}, // Pass provided input or empty object
      userId: userId.toString(),
      scriptId: script.id.toString(),
      executionTimeoutMs: executionTimeoutMs, // Use provided or default from SandboxService
    };

    // 3. Execute script via SandboxService
    const executionResult = await SandboxExecutionService.executeScript(sandboxRequest);

    // 4. Process results (e.g., save logs, metrics - placeholder for now)
    if (executionResult.error || executionResult.exitCode !== 0) {
      console.warn(\`[ScriptRunner] Script \${script.name} execution finished with errors or non-zero exit code.\`, executionResult);
      // Store test results or failure info on the script model (e.g., script.lastSandboxTest) - needs model update & service method
    } else {
      console.log(\`[ScriptRunner] Script \${script.name} execution successful.\`);
      // Store success info
    }

    // 5. Return a combined response
    const response: ScriptRunResponse = {
      ...executionResult,
      scriptId: script.id,
      scriptName: script.name,
      scriptVersion: script.version,
    };

    return response;
  }
}

export default new ScriptRunnerService();
