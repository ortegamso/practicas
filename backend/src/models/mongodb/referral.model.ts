import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser } from './user.model'; // Assuming IUser is the interface for your User model

// Represents a direct referral link or code usage
export interface IReferral extends Document {
  referrer: mongoose.Types.ObjectId | IUser; // The user who made the referral
  referredUser: mongoose.Types.ObjectId | IUser; // The user who was referred
  referralCodeUsed?: string; // The specific code used (if applicable)
  ipAddress?: string; // IP address of the referred user at sign-up (for fraud detection)
  userAgent?: string; // User agent of the referred user at sign-up
  // campaign?: string; // If you have different referral campaigns
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferralModel extends Model<IReferral> {}

const ReferralSchema: Schema<IReferral, IReferralModel> = new Schema({
  referrer: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  referredUser: { // The new user who signed up
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true, // A user can only be referred once directly
    index: true,
  },
  referralCodeUsed: {
    type: String,
    trim: true,
    index: true,
  },
  ipAddress: { type: String },
  userAgent: { type: String },
  // campaign: { type: String, index: true },
}, { timestamps: true });

// Index to quickly find all users referred by a specific referrer
ReferralSchema.index({ referrer: 1, createdAt: -1 });

const Referral: IReferralModel = mongoose.model<IReferral, IReferralModel>('Referral', ReferralSchema);
export default Referral;
console.log('Referral model loaded.');
