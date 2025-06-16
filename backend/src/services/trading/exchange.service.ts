import ccxt, { Exchange, Order, Ticker, Market, Balance, Balances, OrderBook } from 'ccxt';
import ExchangeConfigService from './exchangeConfig.service';
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

// Define a cache for initialized CCXT exchange instances to avoid re-initializing on every call for the same user/config
interface ExchangeInstanceCache {
  [configId: string]: { instance: Exchange; timestamp: number };
}
const exchangeInstanceCache: ExchangeInstanceCache = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // Cache instances for 5 minutes, then re-initialize to refresh connection state/nonces

class ExchangeService {
  private async getExchangeInstance(configId: string, userId: string | mongoose.Types.ObjectId): Promise<Exchange> {
    const cacheEntry = exchangeInstanceCache[configId];
    if (cacheEntry && (Date.now() - cacheEntry.timestamp < CACHE_TTL_MS)) {
      return cacheEntry.instance;
    }

    const decryptedConfig = await ExchangeConfigService.getDecryptedConfigById(configId, userId);
    if (!decryptedConfig) {
      throw new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'Exchange configuration not found or access denied.' });
    }
    if (!decryptedConfig.isActive) {
        throw new AppError({ httpCode: HttpCode.FORBIDDEN, description: 'This exchange configuration is currently inactive.'});
    }

    const exchangeId = decryptedConfig.exchangeName.toLowerCase().replace('_testnet', ''); // CCXT usually doesn't have _testnet in ID
    if (!ccxt.pro[exchangeId] && !ccxt[exchangeId]) { // Check both pro and regular exchanges
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: \`Exchange '\${exchangeId}' is not supported by CCXT or is misconfigured.\`});
    }

    let ccxtInstance: Exchange;
    const exchangeClass = ccxt[exchangeId] || ccxt.pro[exchangeId]; // Prefer pro for WebSocket capabilities later

    try {
        ccxtInstance = new exchangeClass({
            apiKey: decryptedConfig.apiKey,
            secret: decryptedConfig.apiSecret,
            password: decryptedConfig.apiPassphrase, // For exchanges that use passphrase
            // 'enableRateLimit': true, // Recommended by CCXT
            // 'adjustForTimeDifference': true, // Recommended for some exchanges
            // verbose: config.nodeEnv === 'development', // Log CCXT requests/responses in dev
        });

        // Set sandbox mode if applicable
        if (decryptedConfig.isTestnet) {
            if (ccxtInstance.urls.test) {
                ccxtInstance.setSandboxMode(true);
            } else {
                console.warn(\`[ExchangeService] Testnet mode selected for \${exchangeId}, but CCXT driver does not explicitly support sandbox mode via setSandboxMode(). Manual URL override might be needed or it might work by default for some exchanges if API keys are testnet keys.\`);
                // Some exchanges (like Binance) use different API keys for testnet, and CCXT handles it.
                // Others might require specific URLs.
            }
        }
    } catch (e: any) {
        console.error(\`Failed to initialize CCXT instance for \${exchangeId}:\`, e);
        throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to initialize exchange \${exchangeId}: \${e.message}\`});
    }

    // Test connectivity (optional, but good for immediate feedback)
    // try {
    //    await ccxtInstance.fetchTime();
    // } catch (e: any) {
    //     console.error(\`Connectivity test failed for \${exchangeId} with config \${configId}:\`, e.message);
    //     throw new AppError({ httpCode: HttpCode.SERVICE_UNAVAILABLE, description: \`Failed to connect to \${exchangeId}: \${e.message}. Check API keys and network.\`});
    // }

    exchangeInstanceCache[configId] = { instance: ccxtInstance, timestamp: Date.now() };
    return ccxtInstance;
  }

  public async fetchMarkets(configId: string, userId: string): Promise<Market[]> {
    const exchange = await this.getExchangeInstance(configId, userId);
    try {
      return await exchange.fetchMarkets();
    } catch (e: any) {
      console.error(\`[ExchangeService] Error fetching markets for config \${configId}:\`, e);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch markets: \${e.message}\` });
    }
  }

  public async fetchTicker(configId: string, userId: string, symbol: string): Promise<Ticker> {
    const exchange = await this.getExchangeInstance(configId, userId);
    if (!exchange.has['fetchTicker']) {
        throw new AppError({httpCode: HttpCode.NOT_IMPLEMENTED, description: \`\${exchange.id} does not support fetching ticker directly for a single symbol.\`});
    }
    try {
      return await exchange.fetchTicker(symbol);
    } catch (e: any) {
      console.error(\`[ExchangeService] Error fetching ticker for \${symbol} on config \${configId}:\`, e);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch ticker for \${symbol}: \${e.message}\` });
    }
  }

  public async fetchTickers(configId: string, userId: string, symbols?: string[]): Promise<{ [symbol: string]: Ticker }> {
    const exchange = await this.getExchangeInstance(configId, userId);
     if (!exchange.has['fetchTickers']) {
        throw new AppError({httpCode: HttpCode.NOT_IMPLEMENTED, description: \`\${exchange.id} does not support fetching multiple tickers at once.\`});
    }
    try {
      return await exchange.fetchTickers(symbols); // symbols array is optional
    } catch (e: any) {
      console.error(\`[ExchangeService] Error fetching tickers on config \${configId}:\`, e);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch tickers: \${e.message}\` });
    }
  }

  public async fetchOrderBook(configId: string, userId: string, symbol: string, limit?: number): Promise<OrderBook> {
    const exchange = await this.getExchangeInstance(configId, userId);
    if (!exchange.has['fetchOrderBook']) {
        throw new AppError({httpCode: HttpCode.NOT_IMPLEMENTED, description: \`\${exchange.id} does not support fetching order book.\`});
    }
    try {
      return await exchange.fetchOrderBook(symbol, limit);
    } catch (e: any) {
      console.error(\`[ExchangeService] Error fetching order book for \${symbol} on config \${configId}:\`, e);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch order book for \${symbol}: \${e.message}\` });
    }
  }

  public async fetchBalance(configId: string, userId: string): Promise<Balances> {
    const exchange = await this.getExchangeInstance(configId, userId);
    if (!exchange.has['fetchBalance']) {
        throw new AppError({httpCode: HttpCode.NOT_IMPLEMENTED, description: \`\${exchange.id} does not support fetching balance.\`});
    }
    try {
      return await exchange.fetchBalance();
    } catch (e: any) {
      console.error(\`[ExchangeService] Error fetching balance for config \${configId}:\`, e);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch balance: \${e.message}\` });
    }
  }

  // --- Order Management ---
  public async createOrder(
    configId: string,
    userId: string,
    symbol: string,
    type: 'limit' | 'market' | string, // Allow other types CCXT might support
    side: 'buy' | 'sell',
    amount: number,
    price?: number,
    params: object = {} // For exchange-specific parameters like leverage, stopLoss, takeProfit etc.
  ): Promise<Order> {
    const exchange = await this.getExchangeInstance(configId, userId);
    if (!exchange.has['createOrder']) {
        throw new AppError({httpCode: HttpCode.NOT_IMPLEMENTED, description: \`\${exchange.id} does not support creating orders.\`});
    }
    if (type === 'limit' && price === undefined) {
        throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: 'Price is required for limit orders.'});
    }
    try {
      return await exchange.createOrder(symbol, type, side, amount, price, params);
    } catch (e: any) {
      console.error(\`[ExchangeService] Error creating order on config \${configId}:\`, e);
      // CCXT often throws specific error types (e.g., InsufficientFunds, InvalidOrder)
      // We can catch and re-throw these as more specific AppErrors if desired.
      throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: \`Failed to create order: \${e.message}\` }); // Or INTERNAL_SERVER_ERROR depending on error
    }
  }

  public async fetchOrder(configId: string, userId: string, orderId: string, symbol?: string): Promise<Order> {
    const exchange = await this.getExchangeInstance(configId, userId);
    if (!exchange.has['fetchOrder']) {
        throw new AppError({httpCode: HttpCode.NOT_IMPLEMENTED, description: \`\${exchange.id} does not support fetching a single order.\`});
    }
    try {
      return await exchange.fetchOrder(orderId, symbol);
    } catch (e: any) {
      console.error(\`[ExchangeService] Error fetching order \${orderId} on config \${configId}:\`, e);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch order \${orderId}: \${e.message}\` });
    }
  }

  public async fetchOpenOrders(configId: string, userId: string, symbol?: string, since?: number, limit?: number, params?: object): Promise<Order[]> {
    const exchange = await this.getExchangeInstance(configId, userId);
    if (!exchange.has['fetchOpenOrders']) {
        throw new AppError({httpCode: HttpCode.NOT_IMPLEMENTED, description: \`\${exchange.id} does not support fetching open orders.\`});
    }
    try {
      return await exchange.fetchOpenOrders(symbol, since, limit, params);
    } catch (e: any) {
      console.error(\`[ExchangeService] Error fetching open orders on config \${configId}:\`, e);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to fetch open orders: \${e.message}\` });
    }
  }

  public async cancelOrder(configId: string, userId: string, orderId: string, symbol?: string, params: object = {}): Promise<any> {
    const exchange = await this.getExchangeInstance(configId, userId);
    if (!exchange.has['cancelOrder']) {
        throw new AppError({httpCode: HttpCode.NOT_IMPLEMENTED, description: \`\${exchange.id} does not support canceling orders.\`});
    }
    try {
      return await exchange.cancelOrder(orderId, symbol, params);
    } catch (e: any) {
      console.error(\`[ExchangeService] Error canceling order \${orderId} on config \${configId}:\`, e);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: \`Failed to cancel order \${orderId}: \${e.message}\` });
    }
  }

  // Add more methods as needed: fetchMyTrades, fetchClosedOrders, etc.
}

export default new ExchangeService();
