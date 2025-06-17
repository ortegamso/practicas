import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser } from './user.model';
import { IProduct } from './product.model';

export enum OrderStatus {
  PENDING_PAYMENT = 'pending_payment', // Order created, awaiting payment
  PROCESSING = 'processing',         // Payment received, order being processed (e.g., digital goods provisioning, physical goods packaging)
  PAID = 'paid',                     // Legacy or simple status, 'processing' is often more descriptive after payment
  SHIPPED = 'shipped',               // For physical goods
  DELIVERED = 'delivered',             // For physical goods
  COMPLETED = 'completed',             // For digital goods or services successfully rendered
  CANCELED = 'canceled',               // Order canceled by user or admin
  REFUNDED = 'refunded',               // Order refunded
  FAILED = 'failed',                   // Payment failed or other failure
}

// Interface for individual items within an order
export interface IOrderItem extends Document {
  product: mongoose.Types.ObjectId | IProduct; // Reference to the Product
  name: string; // Denormalized product name at time of order
  image?: string; // Denormalized product image at time of order (first image usually)
  quantity: number;
  price: number; // Price per unit at time of order (denormalized)
  // currency: string; // Currency per item, if orders can have mixed currencies (usually order-level)
}

const OrderItemSchema: Schema<IOrderItem> = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: { // Denormalized for historical accuracy in orders
    type: String,
    required: true,
  },
  image: {
    type: String, // First image of product at time of order
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1.'],
  },
  price: { // Price of the product unit at the time of purchase
    type: Number, // Consider storing in cents
    required: true,
    min: [0, 'Price cannot be negative.'],
  },
  // currency: { type: String, required: true },
}, { _id: false }); // _id is false for subdocuments if not needed for individual item identification within order

// Interface for shipping address (can be a subdocument or separate model)
export interface IShippingAddress extends Document {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
  phoneNumber?: string;
}

const ShippingAddressSchema: Schema<IShippingAddress> = new Schema({
  fullName: { type: String, required: true },
  addressLine1: { type: String, required: true },
  addressLine2: { type: String },
  city: { type: String, required: true },
  stateOrProvince: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true },
  phoneNumber: { type: String },
}, { _id: false });


export interface IOrder extends Document {
  user: mongoose.Types.ObjectId | IUser; // User who placed the order
  orderId: string; // Custom, human-readable order ID (e.g., ORD-YYYYMMDD-XXXXX) - auto-generated
  items: IOrderItem[];
  totalAmount: number; // Total amount for the order (sum of item.price * item.quantity + shipping + taxes - discounts)
  currency: string; // e.g., 'USD' - Order level currency
  status: OrderStatus | string;

  // Shipping details (for physical products)
  shippingAddress?: IShippingAddress;
  shippingMethod?: string;
  shippingCost?: number;
  trackingNumber?: string;

  // Payment details (simplified for now)
  paymentMethod?: string; // e.g., 'stripe', 'paypal', 'crypto'
  paymentId?: string; // Transaction ID from payment gateway
  paymentStatus?: 'pending' | 'succeeded' | 'failed'; // More granular payment status
  paidAt?: Date;

  // Optional: Discounts, Taxes
  // discountCode?: string;
  // discountAmount?: number;
  // taxAmount?: number;

  notes?: string; // Customer notes or admin notes

  createdAt: Date;
  updatedAt: Date;
}

export interface IOrderModel extends Model<IOrder> {
  // Static methods
}

const orderSchemaOptions = {
  timestamps: true,
};

const OrderSchema: Schema<IOrder, IOrderModel> = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  orderId: { // Custom order ID
    type: String,
    unique: true,
    required: true,
    index: true,
  },
  items: [OrderItemSchema],
  totalAmount: { // Consider storing in cents
    type: Number,
    required: true,
    min: [0, 'Total amount cannot be negative.'],
  },
  currency: {
    type: String,
    required: true,
    default: 'USD',
  },
  status: {
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.PENDING_PAYMENT,
    required: true,
    index: true,
  },
  shippingAddress: {
    type: ShippingAddressSchema,
    required: false, // Required only if order contains shippable items
  },
  shippingMethod: { type: String },
  shippingCost: { type: Number, default: 0 },
  trackingNumber: { type: String },
  paymentMethod: { type: String },
  paymentId: { type: String },
  paymentStatus: { type: String, enum: ['pending', 'succeeded', 'failed'] },
  paidAt: { type: Date },
  // discountCode: { type: String },
  // discountAmount: { type: Number, default: 0 },
  // taxAmount: { type: Number, default: 0 },
  notes: { type: String, trim: true },
}, orderSchemaOptions);

// Pre-save hook to generate custom orderId if not provided
OrderSchema.pre<IOrder>('save', function(next) {
  if (!this.orderId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    // Simple random part - consider a more robust sequential or globally unique ID generator for high volume
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.orderId = \`ORD-\${year}\${month}\${day}-\${randomPart}\`;
  }
  // Recalculate totalAmount before save if items changed, to ensure consistency
  // This is a basic recalculation, assumes item prices are fixed at time of order.
  // More complex logic for discounts/taxes would go here or in a service.
  if (this.isModified('items') || this.isNew) {
      this.totalAmount = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      if (this.shippingCost) {
          this.totalAmount += this.shippingCost;
      }
      // Add taxes, subtract discounts if they exist
  }

  next();
});

const Order: IOrderModel = mongoose.model<IOrder, IOrderModel>('Order', OrderSchema);

export default Order;

console.log('Order model loaded and schema defined.');
