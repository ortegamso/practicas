import mongoose, { Schema, Document, Model } from 'mongoose';

// Defines the commission structure for referral levels
export interface IReferralLevel extends Document {
  level: number; // e.g., 1 for direct referrals, 2 for referrals of referrals, etc.
  commissionPercentage: number; // e.g., 10 for 10%, 5 for 5%
  description?: string; // Optional description for this level
  isActive: boolean; // Whether this level definition is currently active
  createdAt: Date;
  updatedAt: Date;
}

export interface IReferralLevelModel extends Model<IReferralLevel> {}

const ReferralLevelSchema: Schema<IReferralLevel, IReferralLevelModel> = new Schema({
  level: {
    type: Number,
    required: true,
    unique: true, // Each level (1, 2, 3) should have only one definition
    min: [1, 'Referral level must be at least 1.'],
    index: true,
  },
  commissionPercentage: {
    type: Number,
    required: true,
    min: [0, 'Commission percentage cannot be negative.'],
    max: [100, 'Commission percentage cannot exceed 100.'],
  },
  description: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, { timestamps: true });

const ReferralLevel: IReferralLevelModel = mongoose.model<IReferralLevel, IReferralLevelModel>('ReferralLevel', ReferralLevelSchema);
export default ReferralLevel;
console.log('ReferralLevel model loaded.');
