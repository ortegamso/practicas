import { ethers, JsonRpcProvider, Provider } from 'ethers_v5'; // Using ethers v5 as specified in package.json
import { Connection as SolanaConnection, clusterApiUrl, PublicKey } from '@solana/web3.js';
import config from '../../config'; // Main app config for RPC URLs
import { AppError, HttpCode } from '../../utils/appError';

class Web3Service {
  private ethProvider: Provider | null = null;
  private solanaConnection: SolanaConnection | null = null;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Initialize Ethereum Provider
    if (config.web3?.ethereumRpcUrl) {
      try {
        this.ethProvider = new JsonRpcProvider(config.web3.ethereumRpcUrl);
        console.log(\`[Web3Service] Ethereum provider initialized with RPC: \${config.web3.ethereumRpcUrl}\`);
      } catch (error: any) {
        console.error('[Web3Service] Failed to initialize Ethereum provider:', error.message);
        this.ethProvider = null; // Ensure it's null if initialization fails
      }
    } else {
      console.warn('[Web3Service] Ethereum RPC URL not configured. Ethereum features will be unavailable.');
    }

    // Initialize Solana Connection
    if (config.web3?.solanaRpcUrl) {
      try {
        this.solanaConnection = new SolanaConnection(config.web3.solanaRpcUrl, 'confirmed');
        console.log(\`[Web3Service] Solana connection initialized with RPC: \${config.web3.solanaRpcUrl}\`);
      } catch (error: any) {
        console.error('[Web3Service] Failed to initialize Solana connection:', error.message);
        this.solanaConnection = null; // Ensure it's null if initialization fails
      }
    } else {
      console.warn('[Web3Service] Solana RPC URL not configured. Solana features will be unavailable.');
    }
  }

  public getEthProvider(): Provider {
    if (!this.ethProvider) {
      // Attempt to re-initialize if it was null due to missing config at startup but config might have been updated
      // This is a simple re-attempt; more robust would be an event system for config changes or explicit re-init call.
      this.initializeProviders();
      if(!this.ethProvider) {
        throw new AppError({ httpCode: HttpCode.SERVICE_UNAVAILABLE, description: 'Ethereum provider is not configured or available.' });
      }
    }
    return this.ethProvider;
  }

  public getSolanaConnection(): SolanaConnection {
    if (!this.solanaConnection) {
      this.initializeProviders();
      if (!this.solanaConnection) {
        throw new AppError({ httpCode: HttpCode.SERVICE_UNAVAILABLE, description: 'Solana connection is not configured or available.' });
      }
    }
    return this.solanaConnection;
  }

  // --- Ethereum Methods ---
  public async getEthLatestBlockNumber(): Promise<number | string> {
    const provider = this.getEthProvider();
    try {
      const blockNumber = await provider.getBlockNumber();
      return blockNumber;
    } catch (error: any) {
      console.error('[Web3Service] Error fetching Ethereum latest block number:', error.message);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch ETH block number: \${error.message}\` });
    }
  }

  public async getEthBalance(address: string): Promise<string> {
    const provider = this.getEthProvider();
    if (!ethers.utils.isAddress(address)) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid Ethereum address format.'});
    }
    try {
      const balance = await provider.getBalance(address);
      return ethers.utils.formatEther(balance); // Returns balance in ETH as a string
    } catch (error: any) {
      console.error(\`[Web3Service] Error fetching ETH balance for \${address}:\`, error.message);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch ETH balance: \${error.message}\` });
    }
  }

  // --- Solana Methods ---
  public async getSolanaLatestSlot(): Promise<number | string> {
    const connection = this.getSolanaConnection();
    try {
      const slot = await connection.getSlot();
      return slot;
    } catch (error: any) {
      console.error('[Web3Service] Error fetching Solana latest slot:', error.message);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch SOL slot: \${error.message}\` });
    }
  }

  public async getSolanaBalance(publicKeyString: string): Promise<number | string> {
    const connection = this.getSolanaConnection();
    try {
      const publicKey = new PublicKey(publicKeyString); // Validates public key format
      const balanceLamports = await connection.getBalance(publicKey);
      return balanceLamports / 1e9; // Convert lamports to SOL (1 SOL = 10^9 lamports)
    } catch (error: any) {
      console.error(\`[Web3Service] Error fetching SOL balance for \${publicKeyString}:\`, error.message);
      if (error.message?.includes('Invalid public key')) {
          throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid Solana public key format.'});
      }
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch SOL balance: \${error.message}\` });
    }
  }

  // Placeholder for fetching liquidity pool data (complex)
  // public async getUniswapPoolInfo(poolAddress: string): Promise<any> {
  //   // Requires ABI for Uniswap V2/V3 pair/pool, contract interaction
  //   // const provider = this.getEthProvider();
  //   // const poolContract = new ethers.Contract(poolAddress, UNISWAP_POOL_ABI, provider);
  //   // const reserves = await poolContract.getReserves(); // Example
  //   console.warn("getUniswapPoolInfo is a placeholder and not implemented.");
  //   return { message: "Not implemented" };
  // }

  // public async getRaydiumPoolInfo(poolAddress: string): Promise<any> {
  //   // Requires specific SDKs or direct interaction with Raydium's on-chain programs
  //   console.warn("getRaydiumPoolInfo is a placeholder and not implemented.");
  //   return { message: "Not implemented" };
  // }
}

export default new Web3Service();
