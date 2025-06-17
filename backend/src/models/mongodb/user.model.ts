import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import config from '../../config'; // For JWT secret, though typically not directly in model

// Define available user roles
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  TRADER = 'trader', // Example role
  DEVELOPER = 'developer' // For script marketplace
}

// Interface for User document
export interface IUser extends Document {
  username: string;
  email: string;
  passwordHash: string;
  roles: UserRole[];
  isActive: boolean;
  isEmailVerified: boolean;
  referralCode?: string;
  createdAt: Date;
  updatedAt: Date;
  // Instance methods
  comparePassword(password: string): Promise<boolean>;
}

// Interface for User model (static methods)
export interface IUserModel extends Model<IUser> {
  // Static methods can be defined here if needed
  // e.g., findByUsernameOrEmail(value: string): Promise<IUser | null>;
}

const userSchemaOptions = {
  timestamps: true, // Automatically adds createdAt and updatedAt fields
};

const UserSchema: Schema<IUser, IUserModel> = new Schema({
  username: {
    type: String,
    required: [true, 'Username is required.'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long.'],
    maxlength: [30, 'Username cannot exceed 30 characters.'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores.'],
  },
  email: {
    type: String,
    required: [true, 'Email is required.'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address.'],
  },
  passwordHash: {
    type: String,
    required: [true, 'Password is required.'],
    minlength: [8, 'Password hash indicates an issue, original password likely too short.'], // This is a check on the hash, not original password length
  },
  roles: [{
    type: String,
    enum: Object.values(UserRole),
    default: [UserRole.USER],
    required: true,
  }],
  isActive: {
    type: Boolean,
    default: true, // Or false, requiring admin activation or email verification
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple nulls if not all users have a code, but if set, must be unique
    minlength: [6, 'Referral code must be at least 6 characters.'],
    maxlength: [12, 'Referral code cannot exceed 12 characters.'],
    // match: [/^[a-zA-Z0-9]+$/, 'Referral code can only contain alphanumeric characters.'], // Optional: stricter validation
    index: true,
  },
  // You might add fields like:
  // lastLogin: Date,
  // profile: {
  //   firstName: String,
  //   lastName: String,
  //   avatarUrl: String,
  // },
  // twoFactorEnabled: { type: Boolean, default: false },
  // twoFactorSecret: String,
}, userSchemaOptions);

// --- Middlewares (pre-save hook for password hashing) ---
UserSchema.pre<IUser>('save', async function (next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('passwordHash') && !this.isNew) { // Check if path is 'passwordHash' not 'password'
     // If the document is new but passwordHash is already set (e.g. by seeding a hashed password),
     // and it's not marked as modified, we should still proceed with hashing if it looks like a plain password.
     // However, the current design assumes passwordHash field will be set with a plain password temporarily before hashing.
     // A better approach for `isModified` would be to have a virtual `password` field.
     // For now, if it's a new document, we assume passwordHash might be a plain password to hash.
     // This logic needs careful review based on how registration service sets the password.
     // Let's assume for now that if `passwordHash` is being set/modified, it's the plain password.
  }

  // A more robust check: if passwordHash doesn't look like a bcrypt hash, hash it.
  // Bcrypt hashes typically start with $2a$, $2b$, or $2y$
  if (this.isModified('passwordHash') && !this.passwordHash.startsWith('$2')) {
    try {
      const saltRounds = 10; // Or from config
      this.passwordHash = await bcrypt.hash(this.passwordHash, saltRounds);
      next();
    } catch (error) {
      // If error is not an instance of Error, wrap it
      if (error instanceof Error) {
        next(error);
      } else {
        next(new Error('Error hashing password: ' + String(error)));
      }
    }
  } else {
    next();
  }
});

// --- Instance Methods ---
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// --- Static Methods (Example - not used yet but good for structure) ---
// UserSchema.statics.findByUsernameOrEmail = function (value: string) {
//   return this.findOne({ $or: [{ username: value }, { email: value }] });
// };


// --- Indexes ---
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ roles: 1 });
UserSchema.index({ referralCode: 1 }, { unique: true, sparse: true });


const User: IUserModel = mongoose.model<IUser, IUserModel>('User', UserSchema);

export default User;

console.log('User model loaded and schema defined.');
