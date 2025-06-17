import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser } from './user.model';
import { IOrder } from './order.model'; // To link commission to a specific order
// import { ISubscription } from './subscription.model'; // If you have subscriptions

export enum CommissionStatus {
  PENDING = 'pending',   // Commission calculated, awaiting clearance (e.g., return period)
  CLEARED = 'cleared',   // Commission cleared, available for payout
  PAID = 'paid',       // Commission paid out to referrer
  CANCELED = 'canceled', // Commission canceled (e.g., order refunded)
}

// Represents an instance of earned commission
export interface IReferralCommission extends Document {
  referrer: mongoose.Types.ObjectId | IUser; // User who earned the commission
  referredUser: mongoose.Types.ObjectId | IUser; // User whose purchase generated the commission
  uplineReferrer?: mongoose.Types.ObjectId | IUser; // If multi-level, who referred the 'referrer' (for level 2+ commissions)
  referralLevel: number; // The level of referral this commission is for (1, 2, 3, etc.)
  sourceOrder?: mongoose.Types.ObjectId | IOrder; // The order that triggered this commission
  // sourceSubscription?: mongoose.Types.ObjectId | ISubscription; // Or subscription
  sourceType: 'order' | 'subscription' | 'other'; // Type of source
  sourceAmount: number; // The base amount from which commission was calculated (e.g., order subtotal)
  commissionPercentage: number; // Percentage applied for this commission
  commissionAmount: number; // Calculated commission amount
  currency: string; // Currency of the commission
  status: CommissionStatus | string;
  notes?: string; // Any notes related to this commission
  paidAt?: Date; // When this commission was paid out
  clearedAt?: Date; // When this commission was cleared
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferralCommissionModel extends Model<IReferralCommission> {}

const ReferralCommissionSchema: Schema<IReferralCommission, IReferralCommissionModel> = new Schema({
  referrer: { // The direct beneficiary of this specific commission entry
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  referredUser: { // The user who made the purchase that generated this commission
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  uplineReferrer: { // For multi-level: who referred the 'referrer'. Null for level 1 commissions.
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null,
  },
  referralLevel: { // 1 for direct referral's purchase, 2 for sub-referral's purchase benefiting original referrer, etc.
    type: Number,
    required: true,
    min: 1,
  },
  sourceOrder: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    // required: function() { return this.sourceType === 'order'; }
  },
  // sourceSubscription: { type: Schema.Types.ObjectId, ref: 'Subscription' },
  sourceType: {
    type: String,
    enum: ['order', 'subscription', 'other'],
    required: true,
  },
  sourceAmount: { // Base amount for commission calculation (e.g. order total before tax/shipping, or subscription fee)
    type: Number,
    required: true,
  },
  commissionPercentage: { // The actual percentage used for this calculation
    type: Number,
    required: true,
  },
  commissionAmount: { // The calculated monetary value of the commission
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: Object.values(CommissionStatus),
    default: CommissionStatus.PENDING,
    index: true,
  },
  notes: { type: String, trim: true },
  paidAt: { type: Date },
  clearedAt: { type: Date },
}, { timestamps: true });

// Indexes for querying commissions
ReferralCommissionSchema.index({ referrer: 1, status: 1, createdAt: -1 });
ReferralCommissionSchema.index({ sourceOrder: 1 }); // To find commissions related to an order

const ReferralCommission: IReferralCommissionModel = mongoose.model<IReferralCommission, IReferralCommissionModel>('ReferralCommission', ReferralCommissionSchema);
export default ReferralCommission;
console.log('ReferralCommission model loaded.');
