import User, { IUser } from '../../models/mongodb/user.model';
import Referral, { IReferral } from '../../models/mongodb/referral.model';
import ReferralLevel, { IReferralLevel } from '../../models/mongodb/referralLevel.model';
import ReferralCommission, { IReferralCommission, CommissionStatus } from '../../models/mongodb/referralCommission.model';
import Order, { IOrder } from '../../models/mongodb/order.model'; // To simulate commission trigger
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';
import crypto from 'crypto'; // For generating referral codes

// Helper to generate a unique referral code
const generateReferralCode = (length: number = 8): string => {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length).toUpperCase();
};

class ReferralService {

  // --- Referral Code Management ---
  public async getUserReferralCode(userId: string | mongoose.Types.ObjectId): Promise<string> {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'User not found.' });
    }
    if (user.referralCode) {
      return user.referralCode;
    }
    // Generate and save a new code if one doesn't exist
    let newCode = generateReferralCode();
    let existingUserWithCode = await User.findOne({ referralCode: newCode });
    while (existingUserWithCode) { // Ensure uniqueness
      newCode = generateReferralCode();
      existingUserWithCode = await User.findOne({ referralCode: newCode });
    }
    user.referralCode = newCode;
    await user.save();
    return newCode;
  }

  // --- Tracking Referrals ---
  // Called when a new user signs up, potentially with a referral code
  public async recordNewUserReferral(
    referredUserId: string | mongoose.Types.ObjectId,
    referralCodeOrReferrerId?: string, // Can be a code or direct referrer's User ID
    ipAddress?: string,
    userAgent?: string
  ): Promise<IReferral | null> {
    if (!referralCodeOrReferrerId) return null; // No referral information provided

    let referrer: IUser | null = null;
    let usedCode: string | undefined = undefined;

    // Check if it's a valid ObjectId (direct referrer ID)
    if (mongoose.Types.ObjectId.isValid(referralCodeOrReferrerId)) {
        referrer = await User.findById(referralCodeOrReferrerId);
    } else { // Assume it's a referral code
        referrer = await User.findOne({ referralCode: referralCodeOrReferrerId.toUpperCase() });
        if (referrer) usedCode = referralCodeOrReferrerId.toUpperCase();
    }

    if (!referrer) {
      console.warn(\`[ReferralService] Referrer not found for code/ID: \${referralCodeOrReferrerId}\`);
      return null; // Referrer not found
    }

    // Prevent self-referral
    if (referrer._id.toString() === referredUserId.toString()) {
        console.warn(\`[ReferralService] User \${referredUserId} attempted self-referral.\`);
        return null;
    }

    // Check if the referred user has already been referred
    const existingReferral = await Referral.findOne({ referredUser: referredUserId });
    if (existingReferral) {
        console.warn(\`[ReferralService] User \${referredUserId} has already been referred by \${existingReferral.referrer}.\`);
        return existingReferral; // Or null, or throw error, depending on policy
    }

    const newReferral = new Referral({
      referrer: referrer._id,
      referredUser: referredUserId,
      referralCodeUsed: usedCode,
      ipAddress,
      userAgent,
    });

    try {
      await newReferral.save();
      console.log(\`[ReferralService] New referral recorded: \${referrer.username} -> User ID \${referredUserId}\`);
      // TODO: Potentially trigger welcome emails or notifications here
      return newReferral;
    } catch (error: any) {
      console.error("Error recording new user referral:", error);
      // Don't let referral recording failure block user sign-up, just log it.
      return null;
    }
  }

  // --- Commission Calculation & Recording ---
  // This is a simplified trigger, e.g. after an order is marked as 'completed' or 'paid'
  public async processOrderForCommissions(orderId: string | mongoose.Types.ObjectId): Promise<void> {
    const order = await Order.findById(orderId).populate('user');
    if (!order || !order.user) {
      console.error(\`[ReferralService] Order \${orderId} not found or user not populated for commission processing.\`);
      return;
    }
    // Only process for specific statuses, e.g., when payment is confirmed or order completed
    if (order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.PAID && order.status !== OrderStatus.PROCESSING /* depending on when commission is due */) {
        console.log(\`[ReferralService] Order \${order.orderId} status '\${order.status}' not eligible for commission yet.\`);
        return;
    }

    const referredUser = order.user as IUser; // The user who made the purchase
    const commissionableAmount = order.totalAmount; // Base amount for commission (e.g. subtotal after discounts, before tax/shipping)
                                                 // This needs careful definition based on business rules.
    const currency = order.currency;

    // Find who referred this user (Level 1 referral)
    const directReferral = await Referral.findOne({ referredUser: referredUser._id }).populate('referrer');
    if (!directReferral || !directReferral.referrer) {
      console.log(\`[ReferralService] User \${referredUser.username} was not referred. No commissions to process for order \${order.orderId}.\`);
      return;
    }

    const activeLevels = await ReferralLevel.find({ isActive: true }).sort({ level: 1 });
    if (activeLevels.length === 0) {
        console.warn("[ReferralService] No active referral levels configured. Cannot process commissions.");
        return;
    }

    let currentReferrer = directReferral.referrer as IUser;
    let uplineReferrerForCommissionLog: mongoose.Types.ObjectId | null = null; // For logging who is the upline for this commission entry

    for (const refLevel of activeLevels) {
      if (!currentReferrer) break; // No more upline referrers

      const commissionAmount = (commissionableAmount * refLevel.commissionPercentage) / 100;
      if (commissionAmount <= 0) {
          console.log(\`[ReferralService] Calculated commission is zero or less for level \${refLevel.level}, referrer \${currentReferrer.username}. Skipping.\`);
          // Fetch next upline referrer even if commission is zero for this level to continue chain
          const uplineReferral = await Referral.findOne({ referredUser: currentReferrer._id }).populate('referrer');
          uplineReferrerForCommissionLog = currentReferrer._id; // The one who just got (or didn't get) commission is the upline for the next
          currentReferrer = uplineReferral && uplineReferral.referrer ? uplineReferral.referrer as IUser : null;
          continue;
      }

      // Check if commission for this order, user, level, and referrer already exists
      const existingCommission = await ReferralCommission.findOne({
          sourceOrder: order._id,
          referredUser: referredUser._id, // Person who made the purchase
          referrer: currentReferrer._id, // Person receiving this commission
          referralLevel: refLevel.level,
      });

      if (existingCommission) {
          console.log(\`[ReferralService] Commission already recorded for order \${order.orderId}, user \${referredUser.username}, referrer \${currentReferrer.username}, level \${refLevel.level}.\`);
      } else {
          const newCommission = new ReferralCommission({
            referrer: currentReferrer._id,
            referredUser: referredUser._id,
            uplineReferrer: uplineReferrerForCommissionLog, // This is the referrer of `currentReferrer`
            referralLevel: refLevel.level,
            sourceOrder: order._id,
            sourceType: 'order',
            sourceAmount: commissionableAmount,
            commissionPercentage: refLevel.commissionPercentage,
            commissionAmount: parseFloat(commissionAmount.toFixed(2)), // Round to 2 decimal places
            currency: currency,
            status: CommissionStatus.PENDING, // Initial status
          });
          await newCommission.save();
          console.log(\`[ReferralService] Recorded L\${refLevel.level} commission (\${commissionAmount.toFixed(2)} \${currency}) for \${currentReferrer.username} from order \${order.orderId} by \${referredUser.username}.\`);
      }

      // Find next upline referrer for the next level
      const uplineReferral = await Referral.findOne({ referredUser: currentReferrer._id }).populate('referrer');
      uplineReferrerForCommissionLog = currentReferrer._id; // The one who just got commission is the upline for the next
      currentReferrer = uplineReferral && uplineReferral.referrer ? uplineReferral.referrer as IUser : null;

      // Stop if max levels reached (e.g. if activeLevels defines more than 3, but we only want 3)
      // This check can be based on MAX_REFERRAL_LEVELS from config.
      // if (refLevel.level >= (config.maxReferralLevels || 3)) break;
    }
  }

  // --- Admin: Manage Referral Levels ---
  public async setReferralLevel(level: number, commissionPercentage: number, description?: string, isActive: boolean = true): Promise<IReferralLevel> {
      if (level <= 0) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Level must be positive."});
      if (commissionPercentage < 0 || commissionPercentage > 100) throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Commission percentage must be between 0 and 100."});

      let refLevel = await ReferralLevel.findOne({ level });
      if (refLevel) {
          refLevel.commissionPercentage = commissionPercentage;
          refLevel.description = description;
          refLevel.isActive = isActive;
      } else {
          refLevel = new ReferralLevel({ level, commissionPercentage, description, isActive });
      }
      return refLevel.save();
  }

  public async getReferralLevels(): Promise<IReferralLevel[]> {
      return ReferralLevel.find({ isActive: true }).sort({ level: 1 });
  }

  public async getAllReferralLevelsAdmin(): Promise<IReferralLevel[]> {
      return ReferralLevel.find().sort({ level: 1 });
  }

  // --- User: View Commissions & Referrals ---
  public async getUserCommissions(userId: string | mongoose.Types.ObjectId, page: number = 1, limit: number = 10, status?: CommissionStatus): Promise<any> {
      const query: mongoose.FilterQuery<IReferralCommission> = { referrer: userId };
      if (status) query.status = status;

      const total = await ReferralCommission.countDocuments(query);
      const commissions = await ReferralCommission.find(query)
          .populate('referredUser', 'username email')
          .populate('uplineReferrer', 'username email')
          .populate('sourceOrder', 'orderId totalAmount')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit);
      return { commissions, total, page, pages: Math.ceil(total / limit) };
  }

  public async getUserDirectReferrals(userId: string | mongoose.Types.ObjectId, page: number = 1, limit: number = 10): Promise<any> {
      const query = { referrer: userId };
      const total = await Referral.countDocuments(query);
      const referrals = await Referral.find(query)
          .populate('referredUser', 'username email createdAt')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit);
      return { referrals, total, page, pages: Math.ceil(total / limit) };
  }
}

export default new ReferralService();
