import { executeScriptInDocker } from '../../utils/sandbox/dockerExecutor.utils';
// import { logScriptExecution } from '../../utils/sandbox/executionLogger.utils'; // If needed

export interface ScriptExecutionRequest {
  scriptCode: string;
  language: string; // e.g., 'python', 'javascript'
  inputData?: any; // Data to be passed to the script
  userId?: string; // For logging or context
  scriptId?: string; // For logging or context (e.g. marketplace script ID)
  executionTimeoutMs?: number; // Override default timeout
}

export interface ScriptExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  error?: string; // Errors from the execution process itself
  // logs?: any[]; // Structured logs, if captured
  // status: 'success' | 'failure' | 'timeout' | 'error'; // Overall status
}

class SandboxExecutionService {
  public async executeScript(request: ScriptExecutionRequest): Promise<ScriptExecutionResult> {
    const { scriptCode, language, inputData, userId, scriptId, executionTimeoutMs } = request;

    console.log(\`[SandboxService] Received execution request for language: \${language}, scriptId: \${scriptId}, userId: \${userId}\`);

    if (!scriptCode || !language) {
      throw new Error('Script code and language are required for execution.'); // Or AppError
    }

    // More validation for language support can be added here based on sandbox-runner capabilities.

    const dockerResult = await executeScriptInDocker(
      scriptCode,
      language,
      inputData,
      executionTimeoutMs
    );

    const result: ScriptExecutionResult = {
      ...dockerResult,
      // Determine overall status (example)
      // status: dockerResult.error ? 'error' : (dockerResult.exitCode === 0 ? 'success' : 'failure'),
    };

    // Log execution (placeholder for more detailed logging)
    // await logScriptExecution({ userId, scriptId, language, ...result });
    console.log(\`[SandboxService] Execution completed for \${language} (scriptId: \${scriptId}). Duration: \${result.durationMs}ms, ExitCode: \${result.exitCode}\`);
    if (result.stderr) console.warn(\`[SandboxService] Stderr for \${language} (scriptId: \${scriptId}):
\${result.stderr}\`);
    // if (result.stdout) console.log(\`[SandboxService] Stdout for \${language} (scriptId: \${scriptId}):
\${result.stdout}\`);


    return result;
  }
}

export default new SandboxExecutionService();
