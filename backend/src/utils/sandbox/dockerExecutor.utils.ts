import { exec } from 'child_process';
import fs from 'fs-extra'; // For file system operations like creating temp dirs
import path from 'path';
import os from 'os'; // For temp directory creation
import config from '../../config'; // For sandbox configurations like timeout
import crypto from 'crypto'; // For unique ID generation

const SANDBOX_RUNNER_IMAGE_NAME = 'crypto-trading-platform_sandbox-runner'; // Default from docker-compose if not customized
const DEFAULT_EXECUTION_TIMEOUT_MS = config.sandbox?.timeoutMs || 30000; // e.g., 30 seconds
const MAX_OUTPUT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit for stdout/stderr to prevent abuse

interface DockerExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  error?: string; // For errors in the execution process itself (not script errors)
  // logs?: any[]; // If structured logs are captured from script
}

// Generates a more unique ID for temp directories
const generateSafeRandomId = () => \`sandbox_\${Date.now()}_${crypto.randomBytes(6).toString('hex')}\`;

export const executeScriptInDocker = async (
  scriptCode: string,
  language: string, // e.g., 'python', 'nodejs', 'cpp'
  inputData?: any, // Data to be passed to the script (e.g., via stdin or as a file)
  executionTimeoutMs: number = DEFAULT_EXECUTION_TIMEOUT_MS
): Promise<DockerExecutionResult> => {
  const startTime = Date.now();
  const tempDirHostPath = path.join(os.tmpdir(), generateSafeRandomId());
  const tempDirContainerPath = '/sandbox/scripts_to_run'; // Path inside the sandbox container

  // Define script filename based on language (runner.sh in container might expect specific names or get it as arg)
  let scriptFileName = 'script';
  switch (language.toLowerCase()) {
    case 'python': scriptFileName = 'script.py'; break;
    case 'javascript': case 'nodejs': scriptFileName = 'script.js'; break;
    case 'typescript': scriptFileName = 'script.ts'; break; // Assuming runner.sh handles ts-node or compilation
    case 'php': scriptFileName = 'script.php'; break;
    case 'java': scriptFileName = 'Main.java'; break; // Java expects class name to match file name usually
    case 'cpp': scriptFileName = 'script.cpp'; break;
    case 'rust': scriptFileName = 'script.rs'; break;
    case 'solidity': scriptFileName = 'Contract.sol'; break; // Solidity often has specific file names
    default: scriptFileName = \`script.\${language}\`; // Generic extension
  }

  const scriptFilePathHost = path.join(tempDirHostPath, scriptFileName);
  let inputFilePathHost: string | undefined;

  try {
    await fs.ensureDir(tempDirHostPath);
    await fs.writeFile(scriptFilePathHost, scriptCode);

    if (inputData !== undefined) {
      inputFilePathHost = path.join(tempDirHostPath, 'input.json');
      await fs.writeFile(inputFilePathHost, JSON.stringify(inputData));
    }

    // Docker command construction
    // --rm: Automatically remove the container when it exits
    // -v: Mount the temporary host directory to the workdir in the container
    // --cap-drop=ALL: Drop all capabilities for security (add back specific ones if needed, e.g., NET_BIND_SERVICE)
    // --log-driver=none: Optional, if you don't want Docker to store logs for these ephemeral containers
    // --memory=256m --cpus="0.5": Resource limits (example)
    // The runner.sh script inside the container will execute the actual script
    // It needs to know the language and the script file name.
    // We pass these as arguments to runner.sh

    // The container path for the script will be /sandbox/scripts_to_run/scriptFileName
    const scriptPathInContainer = path.join(tempDirContainerPath, scriptFileName);
    const inputPathInContainer = inputData !== undefined ? path.join(tempDirContainerPath, 'input.json') : undefined;

    // Adjust runner.sh call based on its expected arguments
    // e.g., runner.sh <language> <script_path_in_container> [input_path_in_container]
    let runnerArgs = \`\${language} \${scriptPathInContainer}\`;
    if (inputPathInContainer) {
        runnerArgs += \` \${inputPathInContainer}\`;
    }

    // Using --cidfile to get container ID for potential cleanup on timeout
    const cidFilePathHost = path.join(tempDirHostPath, 'container.cid');

    const dockerCommand = [
      'docker run --rm',
      \`--cidfile "\${cidFilePathHost}"\`,
      \`-v "\${tempDirHostPath}":"\${tempDirContainerPath}":ro\`, // Mount script dir read-only
      '--cap-drop=ALL',
      // '--security-opt=no-new-privileges', // Recommended for security
      // '--user=sandboxuser', // Run as non-root user defined in sandbox Dockerfile
      '--network=none', // No network access unless explicitly needed by script type (e.g. Solidity tests against local testnet)
      '--memory=256m',
      '--cpus="0.5"',
      // '--ulimit nofile=64:64', // Limit open files
      // '--ulimit nproc=64:64', // Limit processes
      SANDBOX_RUNNER_IMAGE_NAME,
      'bash -c', // Use bash -c to properly handle arguments for runner.sh
      \`"/usr/local/bin/runner.sh \${runnerArgs}"\`
    ].join(' ');

    // console.log(`[DockerExecutor] Executing command: \${dockerCommand}`);

    return new Promise<DockerExecutionResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let processError: Error | undefined;
      let containerId: string | undefined;

      const child = exec(dockerCommand, { timeout: executionTimeoutMs + 2000 /* Add buffer for docker overhead */ });

      // Read container ID
      const checkCidFile = async () => {
          try {
              if (await fs.pathExists(cidFilePathHost)) {
                  containerId = (await fs.readFile(cidFilePathHost, 'utf-8')).trim();
                  // console.log(`[DockerExecutor] Container ID: \${containerId}`);
              }
          } catch (e) { /* ignore */ }
      };
      // Check for CID file shortly after starting, and periodically
      setTimeout(checkCidFile, 100);
      const cidCheckInterval = setInterval(checkCidFile, 1000);


      const timer = setTimeout(async () => {
        clearInterval(cidCheckInterval);
        console.warn(\`[DockerExecutor] Script execution timed out after \${executionTimeoutMs}ms for \${scriptFileName}.\`);
        child.kill('SIGKILL'); // Force kill the exec process
        processError = new Error('Execution timed out.');

        // Attempt to stop and remove the Docker container if ID was captured
        if (containerId) {
            console.log(\`[DockerExecutor] Attempting to stop and remove timed-out container \${containerId}\`);
            exec(\`docker stop \${containerId}\`, () => exec(\`docker rm -f \${containerId}\`)); // Stop then force remove
        } else {
            console.warn("[DockerExecutor] Container ID not available for timeout cleanup.");
        }
        // Resolve is handled in 'close' or 'error' event
      }, executionTimeoutMs);

      child.stdout?.on('data', (data) => {
        if (stdout.length < MAX_OUTPUT_SIZE_BYTES) {
            stdout += data.toString();
            if (stdout.length >= MAX_OUTPUT_SIZE_BYTES) {
                stdout = stdout.substring(0, MAX_OUTPUT_SIZE_BYTES);
                stdout += "\n[OUTPUT TRUNCATED DUE TO SIZE LIMIT]";
                console.warn(\`[DockerExecutor] Stdout for \${scriptFileName} truncated due to size limit.\`);
            }
        }
      });

      child.stderr?.on('data', (data) => {
         if (stderr.length < MAX_OUTPUT_SIZE_BYTES) {
            stderr += data.toString();
            if (stderr.length >= MAX_OUTPUT_SIZE_BYTES) {
                stderr = stderr.substring(0, MAX_OUTPUT_SIZE_BYTES);
                stderr += "\n[STDERR TRUNCATED DUE TO SIZE LIMIT]";
                console.warn(\`[DockerExecutor] Stderr for \${scriptFileName} truncated due to size limit.\`);
            }
        }
      });

      child.on('error', (err) => { // Errors in exec process itself
        clearInterval(cidCheckInterval);
        clearTimeout(timer);
        processError = err;
        console.error(\`[DockerExecutor] Error during child_process.exec for \${scriptFileName}:\`, err);
        // This usually means docker command failed to start, not script error.
      });

      child.on('close', (code) => {
        clearInterval(cidCheckInterval);
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        resolve({
          stdout,
          stderr,
          exitCode: code,
          durationMs,
          error: processError?.message, // Include timeout or exec error message
        });
      });
    });

  } catch (error: any) {
    console.error('[DockerExecutor] Unexpected error setting up script execution:', error);
    return {
      stdout: '',
      stderr: error.message || 'Setup error',
      exitCode: -1,
      durationMs: Date.now() - startTime,
      error: 'Error setting up script execution environment.',
    };
  } finally {
    // Clean up the temporary directory on the host
    if (await fs.pathExists(tempDirHostPath)) {
      await fs.remove(tempDirHostPath).catch(err => console.error(\`[DockerExecutor] Error cleaning up temp directory \${tempDirHostPath}:\`, err));
    }
  }
};
