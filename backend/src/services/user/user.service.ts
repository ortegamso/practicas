import User, { IUser, UserRole } from '../../models/mongodb/user.model';
import { AppError, HttpCode } from '../../utils/appError';
import mongoose from 'mongoose';

export interface UserUpdateAdminDto {
  username?: string;
  email?: string;
  roles?: UserRole[];
  isActive?: boolean;
  isEmailVerified?: boolean;
  // Admin should not directly set password here, use a separate password reset mechanism
}

export interface UserListQueryOptions {
  limit?: number;
  page?: number;
  email?: string;
  username?: string;
  role?: UserRole | string;
  isActive?: boolean;
  sortBy?: 'createdAt' | 'username' | 'email';
  sortOrder?: 'asc' | 'desc';
}

// Response DTO, omitting sensitive fields like passwordHash
export type UserResponseDto = Omit<IUser, 'passwordHash' | 'comparePassword'> & { id: string };


class UserService {
  private mapToResponseDto(user: IUser): UserResponseDto {
    // Ensure toObject() is called to strip Mongoose specific properties if not automatically handled
    const userObject = user.toObject ? user.toObject() : { ...user };
    delete userObject.passwordHash; // Explicitly remove passwordHash
    // @ts-ignore
    delete userObject.comparePassword; // Remove method if it's part of the object
    return { ...userObject, id: user._id.toString() };
  }

  public async listUsers(queryOptions: UserListQueryOptions = {}): Promise<{ users: UserResponseDto[], total: number, page: number, pages: number }> {
    const {
        limit = 10,
        page = 1,
        email,
        username,
        role,
        isActive,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = queryOptions;

    const query: mongoose.FilterQuery<IUser> = {};
    if (email) query.email = { \$regex: email, \$options: 'i' };
    if (username) query.username = { \$regex: username, \$options: 'i' };
    if (role) query.roles = role; // Check if 'role' is in the 'roles' array
    if (isActive !== undefined) query.isActive = isActive;

    const sortCriteria: Record<string, mongoose.SortOrder> = {};
    sortCriteria[sortBy] = sortOrder === 'asc' ? 1 : -1;

    try {
      const total = await User.countDocuments(query);
      const users = await User.find(query)
        .sort(sortCriteria)
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-passwordHash') // Ensure passwordHash is not selected
        .exec();

      return {
        users: users.map(user => this.mapToResponseDto(user)),
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    } catch (error: any) {
      console.error("Error listing users:", error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to retrieve users.' });
    }
  }

  public async findUserById(userId: string): Promise<UserResponseDto | null> {
    if (!mongoose.Types.ObjectId.isValid(userId)) return null;
    try {
      const user = await User.findById(userId).select('-passwordHash');
      return user ? this.mapToResponseDto(user) : null;
    } catch (error: any) {
      console.error(\`Error finding user by ID \${userId}:\`, error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to retrieve user.' });
    }
  }

  public async updateUserByAdmin(userId: string, updateData: UserUpdateAdminDto): Promise<UserResponseDto | null> {
    if (!mongoose.Types.ObjectId.isValid(userId)) return null;

    // Prevent admin from updating password directly or critical immutable fields if any
    const { passwordHash, ...safeUpdateData } = updateData as any;
    if (passwordHash) {
        console.warn(\`[UserService] Attempt by admin to update passwordHash directly for user \${userId} was ignored.\`);
    }

    try {
      const user = await User.findByIdAndUpdate(userId, { \$set: safeUpdateData }, { new: true, runValidators: true }).select('-passwordHash');
      if (!user) return null;

      // TODO: If roles changed, may need to invalidate existing JWTs or handle session updates
      // TODO: If email changed and requires verification, set isEmailVerified to false
      if (safeUpdateData.email && user.email !== safeUpdateData.email) {
          // user.isEmailVerified = false; // Example if email verification is a feature
          // await user.save();
      }

      return this.mapToResponseDto(user);
    } catch (error: any) {
      if (error.code === 11000) { // Duplicate key error (e.g. email or username)
        throw new AppError({ httpCode: HttpCode.CONFLICT, description: 'Update failed due to duplicate value (e.g., email or username already exists).' });
      }
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((err: any) => err.message).join(' ');
        throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: messages});
      }
      console.error(\`Error updating user \${userId} by admin:\`, error);
      throw new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Failed to update user.' });
    }
  }

  // activateUser and deactivateUser methods can just use updateUserByAdmin
  public async setUserActiveStatus(userId: string, isActive: boolean): Promise<UserResponseDto | null> {
      return this.updateUserByAdmin(userId, { isActive });
  }

  public async setUserRoles(userId: string, roles: UserRole[]): Promise<UserResponseDto | null> {
      // TODO: Add validation for roles against UserRole enum
      if (!Array.isArray(roles) || !roles.every(role => Object.values(UserRole).includes(role))) {
          throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid roles provided."});
      }
      return this.updateUserByAdmin(userId, { roles });
  }

}
export default new UserService();
