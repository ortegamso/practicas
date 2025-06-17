import mongoose, { Schema, Document, Model } from 'mongoose';

export enum ProductCategory {
  BOT = 'trading_bot',
  SCRIPT = 'trading_script', // For standalone scripts, distinct from marketplace scripts run on platform
  SERVICE = 'service', // e.g., premium support, consultation
  MERCHANDISE = 'merchandise',
  EDUCATIONAL = 'educational_material',
  OTHER = 'other',
}

export interface IProduct extends Document {
  name: string;
  slug: string; // URL-friendly version of the name
  description: string;
  price: number; // Store price in cents to avoid floating point issues, or use Decimal128
  currency: string; // e.g., 'USD', 'EUR', or potentially a crypto like 'USDT'
  category: ProductCategory | string;
  tags?: string[];
  stock?: number; // Optional: for physical goods or limited digital items
  images?: string[]; // Array of URLs to product images
  isActive: boolean; // Whether the product is available for sale
  // attributes?: Record<string, any>; // For custom product attributes e.g. { 'color': 'red', 'size': 'M' }
  // relatedProducts?: mongoose.Types.ObjectId[]; // Reference to other IProduct

  createdAt: Date;
  updatedAt: Date;
}

export interface IProductModel extends Model<IProduct> {
  // Static methods if needed, e.g., findBySlug(slug: string)
}

const productSchemaOptions = {
  timestamps: true,
};

const ProductSchema: Schema<IProduct, IProductModel> = new Schema({
  name: {
    type: String,
    required: [true, 'Product name is required.'],
    trim: true,
    maxlength: [150, 'Product name cannot exceed 150 characters.'],
  },
  slug: { // To be generated from name, e.g., using a pre-save hook or service logic
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  description: {
    type: String,
    required: [true, 'Product description is required.'],
    trim: true,
  },
  price: { // Consider storing in cents (integer) if dealing with USD/EUR to avoid float issues
    type: Number, // Or Schema.Types.Decimal128 for precise decimal values
    required: [true, 'Product price is required.'],
    min: [0, 'Price cannot be negative.'],
  },
  currency: {
    type: String,
    required: [true, 'Currency is required.'],
    default: 'USD', // Default currency
    trim: true,
    uppercase: true,
    maxlength: [5, 'Currency code too long.']
  },
  category: {
    type: String,
    // enum: Object.values(ProductCategory), // Uncomment if strict enum adherence is desired
    required: [true, 'Product category is required.'],
    trim: true,
    index: true,
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  stock: { // For items with limited quantity
    type: Number,
    min: [0, 'Stock cannot be negative.'],
    default: null, // Null means infinite stock or not tracked
  },
  images: [{ // URLs to product images
    type: String,
    trim: true,
    // match: [/^https?:\/\/.*/, 'Invalid image URL format'], // Basic URL validation
  }],
  isActive: { // Is the product listed and available for purchase?
    type: Boolean,
    default: true,
    index: true,
  },
  // attributes: {
  //   type: Schema.Types.Mixed, // For flexible key-value attributes
  // },
  // relatedProducts: [{
  //   type: Schema.Types.ObjectId,
  //   ref: 'Product'
  // }],
}, productSchemaOptions);

// Pre-save hook to generate slug from name if not provided or if name changes
ProductSchema.pre<IProduct>('save', function(next) {
  if (this.isModified('name') || !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w-]+/g, '') // Remove all non-word chars
      .replace(/--+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, ''); // Trim - from end of text
    if (!this.slug) { // Handle cases where name results in empty slug (e.g. only special chars)
        this.slug = new mongoose.Types.ObjectId().toString(); // Fallback to ObjectId as slug
    }
  }
  next();
});

// Index for text search (optional, but useful for e-commerce)
// ProductSchema.index({ name: 'text', description: 'text', tags: 'text' });

const Product: IProductModel = mongoose.model<IProduct, IProductModel>('Product', ProductSchema);

export default Product;

console.log('Product model loaded and schema defined.');
