import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser } from './user.model'; // Assuming IUser is the interface for your User model

// Supported exchanges (can be expanded)
export enum SupportedExchange {
  BINANCE = 'binance',
  BYBIT = 'bybit',
  BITMEX = 'bitmex',
  HUOBI = 'huobi',
  OKEX = 'okex',
  // Add more as needed, ensure these match CCXT IDs if possible
  // For testnets, you might use a naming convention or a separate field
  BINANCE_TESTNET = 'binance_testnet', // Example for testnet
  BYBIT_TESTNET = 'bybit_testnet',     // Example for testnet
}

export interface IExchangeConfig extends Document {
  user: mongoose.Types.ObjectId | IUser; // Reference to the User model
  exchangeName: SupportedExchange | string; // Standardized exchange name
  friendlyName?: string; // Optional user-defined name for the configuration
  apiKeyEncrypted: string; // Encrypted API key
  apiSecretEncrypted: string; // Encrypted API secret
  apiPassphraseEncrypted?: string; // Optional: For exchanges like KuCoin, OKEx that use a passphrase
  isTestnet: boolean;
  isActive: boolean; // To enable/disable this configuration for trading
  createdAt: Date;
  updatedAt: Date;
  // You could add lastUsedAt: Date or status: string (e.g., 'valid', 'invalid_key')
}

export interface IExchangeConfigModel extends Model<IExchangeConfig> {
  // Static methods can be defined here
}

const exchangeConfigSchemaOptions = {
  timestamps: true, // Automatically adds createdAt and updatedAt fields
};

const ExchangeConfigSchema: Schema<IExchangeConfig, IExchangeConfigModel> = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Reference to the User model
    required: true,
    index: true,
  },
  exchangeName: {
    type: String,
    // enum: Object.values(SupportedExchange), // Use this if you want to strictly enforce from the enum
    required: [true, 'Exchange name is required.'],
    trim: true,
    lowercase: true, // Store exchange names consistently
  },
  friendlyName: {
    type: String,
    trim: true,
    maxlength: [50, 'Friendly name cannot exceed 50 characters.'],
  },
  apiKeyEncrypted: {
    type: String,
    required: [true, 'Encrypted API key is required.'],
  },
  apiSecretEncrypted: {
    type: String,
    required: [true, 'Encrypted API secret is required.'],
  },
  apiPassphraseEncrypted: { // Optional field
    type: String,
  },
  isTestnet: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  // lastUsedAt: Date,
  // status: { type: String, enum: ['pending_verification', 'valid', 'invalid_key', 'expired_key'], default: 'pending_verification' },
}, exchangeConfigSchemaOptions);

// --- Compound Index ---
// Ensures a user cannot have multiple active configurations for the same exchange (and testnet status)
// Consider if friendlyName should be part of this uniqueness or if multiple configs for same exchange are allowed if friendlyName differs.
// For now, assuming one config per user per exchange (real/testnet).
ExchangeConfigSchema.index({ user: 1, exchangeName: 1, isTestnet: 1 }, { unique: true, name: 'user_exchange_testnet_unique' });

// --- Methods ---
// No specific methods defined here yet, but could include helpers for decryption if key management was simpler
// (though decryption should ideally happen in a service layer, not directly in the model).

const ExchangeConfig: IExchangeConfigModel = mongoose.model<IExchangeConfig, IExchangeConfigModel>('ExchangeConfig', ExchangeConfigSchema);

export default ExchangeConfig;

console.log('ExchangeConfig model loaded and schema defined.');
