import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser } from './user.model';

export enum ScriptLanguage {
  PYTHON = 'python',
  JAVASCRIPT = 'javascript', // Node.js typically
  TYPESCRIPT = 'typescript', // May need transpilation before sandbox
  PINESCRIPT = 'pinescript', // TradingView specific, might need interpreter/converter
  CPP = 'cpp',
  JAVA = 'java',
  RUST = 'rust',
  SOLIDITY = 'solidity', // For smart contracts, execution context is different
  OTHER = 'other',
}

export enum ScriptCategory {
  TECHNICAL_ANALYSIS = 'technical_analysis',
  ARBITRAGE = 'arbitrage',
  MARKET_MAKING = 'market_making',
  GRID_TRADING = 'grid_trading',
  AI_ML = 'ai_ml',
  UTILITY = 'utility', // e.g., risk calculators, portfolio trackers
  OTHER = 'other',
}

export enum ScriptApprovalStatus {
    PENDING_APPROVAL = 'pending_approval',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    NEEDS_REVISION = 'needs_revision',
    // ARCHIVED = 'archived', // If authors can archive
}

// Interface for sandbox test results (simplified placeholder)
interface ISandboxTestResult {
  testDate: Date;
  status: 'passed' | 'failed' | 'error';
  summary?: string;
  logs?: string; // Link to logs or embedded logs (can be large)
  // performanceMetrics?: Record<string, any>; // e.g., PNL, Sharpe, if backtesting
}

export interface IMarketplaceScript extends Document {
  author: mongoose.Types.ObjectId | IUser;
  name: string;
  slug: string; // URL-friendly version of the name
  description: string;
  longDescription?: string; // Markdown supported, more detailed description
  language: ScriptLanguage | string;
  code: string; // The actual script code or a reference/link to it (e.g., Git repo, IPFS hash)
               // Storing large code directly in MongoDB might not be ideal for performance.
               // Consider external storage for production.
  version: string; // e.g., '1.0.0', '1.0.1-beta'
  price: number; // Price in cents or use Decimal128. 0 for free scripts.
  currency: string; // e.g., 'USD'

  tags?: string[]; // Searchable tags
  category: ScriptCategory | string;

  // Ratings and Reviews (simplified, could be a separate model)
  averageRating?: number; // Calculated average
  ratingCount?: number;   // Number of ratings received
  // reviews?: mongoose.Types.ObjectId[]; // Ref to Review model

  downloadCount?: number; // Or purchaseCount if it's a paid script
  executionCount?: number; // How many times it has been run on the platform (if applicable)

  isActive: boolean; // Is the script listed on the marketplace (set by author)
  approvalStatus: ScriptApprovalStatus | string; // Admin approval status
  adminFeedback?: string; // Feedback from admin if rejected or needs revision

  // Sandbox testing information (placeholders)
  // lastSandboxTest?: ISandboxTestResult;
  // isVerifiedByPlatform?: boolean; // If it passed a standard set of platform tests

  // For executable scripts on platform:
  // compatibleExchanges?: string[]; // e.g., ['binance', 'bybit']
  // requiredInputs?: any[]; // Description of inputs the script expects
  // outputDescription?: any; // Description of what the script outputs

  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date; // When it was last approved and made public
}

export interface IMarketplaceScriptModel extends Model<IMarketplaceScript> {}

const marketplaceScriptSchemaOptions = {
  timestamps: true,
};

const MarketplaceScriptSchema: Schema<IMarketplaceScript, IMarketplaceScriptModel> = new Schema({
  author: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Script name is required.'],
    trim: true,
    maxlength: [100, 'Script name cannot exceed 100 characters.'],
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  description: { // Short description
    type: String,
    required: [true, 'Short description is required.'],
    trim: true,
    maxlength: [250, 'Short description cannot exceed 250 characters.'],
  },
  longDescription: { // Detailed description, potentially Markdown
    type: String,
    trim: true,
    maxlength: [10000, 'Long description is too long.'],
  },
  language: {
    type: String,
    // enum: Object.values(ScriptLanguage), // Uncomment if strict enum
    required: [true, 'Script language is required.'],
    trim: true,
    index: true,
  },
  code: { // Consider alternatives for large scripts (e.g., link to Git, S3, IPFS)
    type: String,
    required: [true, 'Script code or reference is required.'],
    // minlength: [10, "Script code seems too short."], // Basic check
  },
  version: {
    type: String,
    required: [true, 'Version is required (e.g., 1.0.0).'],
    trim: true,
    // match: [/^\d+\.\d+\.\d+([\-|\+].*)?$/, 'Invalid version format (e.g., 1.0.0, 1.0.1-beta).'] // Semantic versioning-like
  },
  price: { // Price in cents (integer) or use Decimal128
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative.'], // 0 for free scripts
    default: 0,
  },
  currency: {
    type: String,
    required: true,
    default: 'USD',
    trim: true,
    uppercase: true,
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    index: true,
  }],
  category: {
    type: String,
    // enum: Object.values(ScriptCategory), // Uncomment if strict enum
    required: [true, 'Script category is required.'],
    trim: true,
    index: true,
  },
  averageRating: { type: Number, min: 0, max: 5, default: 0 },
  ratingCount: { type: Number, min: 0, default: 0 },
  // reviews: [{ type: Schema.Types.ObjectId, ref: 'Review' }],
  downloadCount: { type: Number, min: 0, default: 0 },
  executionCount: { type: Number, min: 0, default: 0 },
  isActive: { // Author's intent to list it (if approved)
    type: Boolean,
    default: false, // Default to inactive until author explicitly lists and admin approves
    index: true,
  },
  approvalStatus: {
    type: String,
    enum: Object.values(ScriptApprovalStatus),
    default: ScriptApprovalStatus.PENDING_APPROVAL,
    required: true,
    index: true,
  },
  adminFeedback: { type: String, trim: true },
  // lastSandboxTest: { type: Schema.Types.Mixed }, // Store simplified result or link
  // isVerifiedByPlatform: { type: Boolean, default: false },
  // compatibleExchanges: [{ type: String, trim: true, lowercase: true }],
  // requiredInputs: [Schema.Types.Mixed],
  // outputDescription: Schema.Types.Mixed,
  publishedAt: { type: Date, index: true },
}, marketplaceScriptSchemaOptions);

// Pre-save hook for slug generation (similar to Product)
MarketplaceScriptSchema.pre<IMarketplaceScript>('save', function(next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
    if (!this.slug) this.slug = new mongoose.Types.ObjectId().toString();
  }
  // If status becomes APPROVED and publishedAt is not set, set it.
  if (this.isModified('approvalStatus') && this.approvalStatus === ScriptApprovalStatus.APPROVED && !this.publishedAt) {
      this.publishedAt = new Date();
  }
  next();
});

// Compound index for author and name/version (optional, for uniqueness per author)
// MarketplaceScriptSchema.index({ author: 1, name: 1, version: 1 }, { unique: true });
MarketplaceScriptSchema.index({ author: 1, slug: 1, version: 1 }, { unique: true, name: 'author_slug_version_unique' });
MarketplaceScriptSchema.index({ language: 1, category: 1, tags: 1 }); // For filtering/searching
MarketplaceScriptSchema.index({ name: 'text', description: 'text', tags: 'text' }); // For text search

const MarketplaceScript: IMarketplaceScriptModel = mongoose.model<IMarketplaceScript, IMarketplaceScriptModel>('MarketplaceScript', MarketplaceScriptSchema);

export default MarketplaceScript;

console.log('MarketplaceScript model (script.model.ts) loaded and schema defined.');
