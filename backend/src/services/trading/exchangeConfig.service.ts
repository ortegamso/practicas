import ExchangeConfig, { IExchangeConfig, SupportedExchange } from '../../models/mongodb/exchangeConfig.model';
import { encrypt, decrypt } from '../../utils/encryption.utils';
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

export interface ExchangeConfigCreateDto {
  userId: string | mongoose.Types.ObjectId;
  exchangeName: SupportedExchange | string;
  friendlyName?: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
  isTestnet?: boolean;
  isActive?: boolean;
}

export interface ExchangeConfigUpdateDto {
  friendlyName?: string;
  apiKey?: string; // If provided, will be re-encrypted
  apiSecret?: string; // If provided, will be re-encrypted
  apiPassphrase?: string; // If provided, will be re-encrypted
  isTestnet?: boolean;
  isActive?: boolean;
}

// For returning to the client (API key masked)
export interface ExchangeConfigResponseDto {
  id: string;
  userId: string;
  exchangeName: string;
  friendlyName?: string;
  apiKeyMasked: string; // e.g., "********keypart"
  isTestnet: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  hasPassphrase?: boolean; // Indicates if a passphrase was set
}

const maskApiKey = (apiKey: string): string => {
  if (!apiKey || apiKey.length < 8) return "****";
  return \`\${'*'.repeat(apiKey.length - 4)}\${apiKey.slice(-4)}\`;
};

class ExchangeConfigService {
  public async create(data: ExchangeConfigCreateDto): Promise<ExchangeConfigResponseDto> {
    const { userId, exchangeName, friendlyName, apiKey, apiSecret, apiPassphrase, isTestnet, isActive } = data;

    if (!apiKey || !apiSecret) {
        throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: 'API key and secret are required.'});
    }

    const newConfig = new ExchangeConfig({
      user: userId,
      exchangeName: exchangeName.toLowerCase().trim(),
      friendlyName,
      apiKeyEncrypted: encrypt(apiKey),
      apiSecretEncrypted: encrypt(apiSecret),
      apiPassphraseEncrypted: apiPassphrase ? encrypt(apiPassphrase) : undefined,
      isTestnet: isTestnet === undefined ? false : isTestnet,
      isActive: isActive === undefined ? true : isActive,
    });

    try {
      const savedConfig = await newConfig.save();
      return this.mapToResponseDto(savedConfig, apiKey); // Pass original API key for masking
    } catch (error: any) {
      if (error.code === 11000 || error.message.includes('duplicate key error')) { // Handle unique index violation (e.g., user_exchange_testnet_unique)
        throw new AppError({ httpCode: HttpCode.CONFLICT, description: \`An API configuration for this exchange (\${exchangeName}) and testnet status already exists for this user.\` });
      }
      console.error("Error creating exchange config:", error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to save exchange configuration.' });
    }
  }

  public async findByUserId(userId: string | mongoose.Types.ObjectId): Promise<ExchangeConfigResponseDto[]> {
    const configs = await ExchangeConfig.find({ user: userId }).sort({ createdAt: -1 });
    // Note: We don't have the decrypted API keys here to mask them perfectly based on original.
    // Masking will be generic or we'd need to decrypt then mask (less ideal for list view).
    // For simplicity, we'll just indicate it's masked.
    return configs.map(config => this.mapToResponseDto(config, "")); // Pass empty string as API key cannot be decrypted here easily
  }

  // Get a single config, with decrypted keys (for internal use by CCXT service)
  public async getDecryptedConfigById(id: string, userId: string | mongoose.Types.ObjectId): Promise<IExchangeConfig | null> {
    const config = await ExchangeConfig.findOne({ _id: id, user: userId });
    if (!config) return null;

    // Return a new object with decrypted values, don't modify the mongoose doc directly
    return {
        ...config.toObject(), // Get plain object from Mongoose doc
        apiKey: decrypt(config.apiKeyEncrypted),
        apiSecret: decrypt(config.apiSecretEncrypted),
        apiPassphrase: config.apiPassphraseEncrypted ? decrypt(config.apiPassphraseEncrypted) : undefined,
    } as IExchangeConfig & { apiKey: string; apiSecret: string; apiPassphrase?: string }; // Type assertion
  }


  public async findByIdForUser(id: string, userId: string | mongoose.Types.ObjectId): Promise<ExchangeConfigResponseDto | null> {
    const config = await ExchangeConfig.findOne({ _id: id, user: userId });
    if (!config) return null;
    // Decrypt temporarily to get the original API key for masking
    const decryptedApiKey = decrypt(config.apiKeyEncrypted);
    return this.mapToResponseDto(config, decryptedApiKey);
  }

  public async update(id: string, userId: string | mongoose.Types.ObjectId, updateData: ExchangeConfigUpdateDto): Promise<ExchangeConfigResponseDto | null> {
    const config = await ExchangeConfig.findOne({ _id: id, user: userId });
    if (!config) {
      return null; // Or throw Not Found AppError
    }

    if (updateData.friendlyName !== undefined) config.friendlyName = updateData.friendlyName;
    if (updateData.apiKey) config.apiKeyEncrypted = encrypt(updateData.apiKey);
    if (updateData.apiSecret) config.apiSecretEncrypted = encrypt(updateData.apiSecret);
    if (updateData.apiPassphrase !== undefined) { // Check for undefined to allow clearing passphrase
        config.apiPassphraseEncrypted = updateData.apiPassphrase ? encrypt(updateData.apiPassphrase) : undefined;
    }
    if (updateData.isTestnet !== undefined) config.isTestnet = updateData.isTestnet;
    if (updateData.isActive !== undefined) config.isActive = updateData.isActive;

    // Need to handle potential unique index violation if exchangeName or isTestnet is changed
    // For now, assuming these are not updatable or handled by separate logic if they are.

    try {
        const updatedConfig = await config.save();
        const currentApiKey = updateData.apiKey || decrypt(updatedConfig.apiKeyEncrypted); // Use new or decrypted old key for masking
        return this.mapToResponseDto(updatedConfig, currentApiKey);
    } catch (error: any) {
         if (error.code === 11000 || error.message.includes('duplicate key error')) {
            throw new AppError({ httpCode: HttpCode.CONFLICT, description: \`Update violates unique constraint: an API configuration for this exchange and testnet status may already exist.\` });
        }
        console.error("Error updating exchange config:", error);
        throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to update exchange configuration.' });
    }
  }

  public async delete(id: string, userId: string | mongoose.Types.ObjectId): Promise<boolean> {
    const result = await ExchangeConfig.deleteOne({ _id: id, user: userId });
    return result.deletedCount === 1;
  }

  private mapToResponseDto(config: IExchangeConfig, originalApiKeyForMasking?: string): ExchangeConfigResponseDto {
    let apiKeyToMask = "";
    if (originalApiKeyForMasking) {
        apiKeyToMask = originalApiKeyForMasking;
    } else {
        // Fallback if original key isn't available for masking (e.g. list view)
        // This path means we cannot accurately mask based on the original key's length/content.
        // We could try to decrypt here, but it adds overhead for list views.
        // For now, if originalApiKeyForMasking is not provided, we use a generic mask or the encrypted one.
        // Let's assume for list views, a generic mask is fine, or we decide not to show apiKeyMasked.
        // For GET by ID, we should decrypt to mask.
        try {
            if(config.apiKeyEncrypted) apiKeyToMask = decrypt(config.apiKeyEncrypted);
        } catch (e) {
            console.warn("Could not decrypt API key for masking in mapToResponseDto, using generic mask.", e);
            apiKeyToMask = "decryption_failed_mask"; // Or some other indicator
        }
    }

    return {
      id: config.id,
      userId: typeof config.user === 'string' ? config.user : (config.user as mongoose.Types.ObjectId).toString(),
      exchangeName: config.exchangeName,
      friendlyName: config.friendlyName,
      apiKeyMasked: maskApiKey(apiKeyToMask),
      isTestnet: config.isTestnet,
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      hasPassphrase: !!config.apiPassphraseEncrypted,
    };
  }
}

export default new ExchangeConfigService();
