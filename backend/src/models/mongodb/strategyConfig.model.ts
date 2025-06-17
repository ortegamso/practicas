import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser } from './user.model';
import { IExchangeConfig } from './exchangeConfig.model'; // To reference specific exchange config
// import { IMarketplaceScript } from './script.model'; // For later marketplace integration

// Define known strategy types/identifiers if you have predefined strategies
// export enum PredefinedStrategyType {
//   MOVING_AVERAGE_CROSSOVER = 'ma_crossover',
//   RSI_BASIC = 'rsi_basic',
//   // Add more as they are implemented in the engine
// }

export interface IStrategyConfig extends Document {
  user: mongoose.Types.ObjectId | IUser;
  name: string;
  description?: string;
  exchangeConfig: mongoose.Types.ObjectId | IExchangeConfig; // Link to a specific user's exchange configuration
  symbol: string; // e.g., BTC/USDT - The trading pair for this strategy instance

  // For predefined strategies (if not using marketplace scripts initially)
  // strategyType?: PredefinedStrategyType | string; // Identifier for a built-in strategy

  // For marketplace scripts (to be used later)
  // script?: mongoose.Types.ObjectId | IMarketplaceScript; // Link to a script from the marketplace

  // Parameters for the strategy (flexible structure)
  // Examples:
  // For MA Crossover: { shortPeriod: 9, longPeriod: 21, candleInterval: '1h' }
  // For RSI: { period: 14, overboughtThreshold: 70, oversoldThreshold: 30, candleInterval: '15m' }
  parameters: mongoose.Schema.Types.Mixed; // Allows any JSON-like structure

  isActive: boolean; // Whether this strategy instance should be running
  status: 'running' | 'stopped' | 'paused' | 'error' | 'pending_start'; // Runtime status
  lastSignalTime?: Date;
  healthMessage?: string; // e.g., error message or status update from the engine

  createdAt: Date;
  updatedAt: Date;
}

export interface IStrategyConfigModel extends Model<IStrategyConfig> {
  // Static methods if needed
}

const strategyConfigSchemaOptions = {
  timestamps: true,
};

const StrategyConfigSchema: Schema<IStrategyConfig, IStrategyConfigModel> = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Strategy name is required.'],
    trim: true,
    maxlength: [100, 'Strategy name cannot exceed 100 characters.'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters.'],
  },
  exchangeConfig: { // Which API keys to use for this strategy
    type: Schema.Types.ObjectId,
    ref: 'ExchangeConfig',
    required: [true, 'An exchange configuration (API key set) is required.'],
    index: true,
  },
  symbol: { // The specific market this strategy instance will trade on
    type: String,
    required: [true, 'Trading symbol (e.g., BTC/USDT) is required.'],
    trim: true,
    uppercase: true, // Store symbols consistently
  },
  // strategyType: { // For predefined strategies
  //   type: String,
  //   // enum: Object.values(PredefinedStrategyType), // Uncomment if using enum
  //   // required: function() { return !this.script; } // Required if not a marketplace script
  // },
  // script: { // For marketplace scripts
  //   type: Schema.Types.ObjectId,
  //   ref: 'MarketplaceScript',
  //   // required: function() { return !this.strategyType; } // Required if not a predefined strategy
  // },
  parameters: {
    type: Schema.Types.Mixed,
    required: [true, 'Strategy parameters are required.'],
    // Basic validation to ensure it's an object (though Mixed allows anything)
    validate: {
        validator: function(v: any) {
            return typeof v === 'object' && v !== null && !Array.isArray(v);
        },
        message: 'Parameters must be a valid object.'
    }
  },
  isActive: { // User's intent to run this strategy
    type: Boolean,
    default: false,
    index: true,
  },
  status: { // Actual runtime status controlled by the engine
    type: String,
    enum: ['running', 'stopped', 'paused', 'error', 'pending_start'],
    default: 'stopped',
    index: true,
  },
  lastSignalTime: {
    type: Date,
  },
  healthMessage: {
    type: String,
    trim: true,
  }
}, strategyConfigSchemaOptions);

// Compound index for user, name to ensure unique strategy names per user (optional)
StrategyConfigSchema.index({ user: 1, name: 1 }, { unique: true, name: 'user_strategy_name_unique' });
// Index for efficient querying of active strategies by the engine
StrategyConfigSchema.index({ isActive: 1, status: 1 });


const StrategyConfig: IStrategyConfigModel = mongoose.model<IStrategyConfig, IStrategyConfigModel>('StrategyConfig', StrategyConfigSchema);

export default StrategyConfig;

console.log('StrategyConfig model loaded and schema defined.');
