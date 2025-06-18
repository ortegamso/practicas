import { Request, Response, NextFunction } from 'express';
import UserService, { UserUpdateAdminDto, UserListQueryOptions } from '../../services/user/user.service';
import { AppError, HttpCode } from '../../utils/appError';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware'; // For admin checks (though middleware handles role)
import { UserRole } from '../../models/mongodb/user.model';

class UserManagementController {
  public async listUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const queryOptions: UserListQueryOptions = {
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 10,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        email: req.query.email as string | undefined,
        username: req.query.username as string | undefined,
        role: req.query.role as UserRole | undefined,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        sortBy: req.query.sortBy as UserListQueryOptions['sortBy'] | undefined,
        sortOrder: req.query.sortOrder as UserListQueryOptions['sortOrder'] | undefined,
      };
      // Validate numeric inputs
      if (isNaN(queryOptions.limit!)) queryOptions.limit = 10;
      if (isNaN(queryOptions.page!)) queryOptions.page = 1;
      if (queryOptions.role && !Object.values(UserRole).includes(queryOptions.role as UserRole)) {
          throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'role' filter value."});
      }

      const result = await UserService.listUsers(queryOptions);
      res.status(HttpCode.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  public async getUserById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const user = await UserService.findUserById(userId);
      if (!user) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'User not found.' }));
      }
      res.status(HttpCode.OK).json(user);
    } catch (error) {
      next(error);
    }
  }

  public async updateUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const updateDto: UserUpdateAdminDto = req.body;
      if (Object.keys(updateDto).length === 0) {
        throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'No update data provided.' });
      }
      // Validate roles if provided
      if (updateDto.roles && (!Array.isArray(updateDto.roles) || !updateDto.roles.every(role => Object.values(UserRole).includes(role)))) {
          throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: "Invalid 'roles' array or values."});
      }


      const updatedUser = await UserService.updateUserByAdmin(userId, updateDto);
      if (!updatedUser) {
        return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'User not found or update failed.' }));
      }
      res.status(HttpCode.OK).json(updatedUser);
    } catch (error) {
      next(error);
    }
  }

  public async setUserActiveStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
        const { userId } = req.params;
        const { isActive } = req.body;
        if (isActive === undefined || typeof isActive !== 'boolean') {
            throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: "'isActive' (boolean) is required in the request body." });
        }
        const updatedUser = await UserService.setUserActiveStatus(userId, isActive);
        if (!updatedUser) {
            return next(new AppError({ httpCode: HttpCode.NOT_FOUND, description: 'User not found or status update failed.' }));
        }
        res.status(HttpCode.OK).json(updatedUser);
    } catch (error) {
        next(error);
    }
  }
}

export default new UserManagementController();
