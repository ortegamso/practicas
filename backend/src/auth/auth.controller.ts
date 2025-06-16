import { Request, Response, NextFunction } from 'express';
import AuthService, { RegisterUserDto, LoginUserDto } from './auth.service';
import { HttpCode, AppError } from '../utils/appError'; // Assuming AppError is in utils

// Basic input validation helper (can be replaced with a library like Joi or express-validator)
const validateRegisterInput = (data: any): RegisterUserDto => {
  const { username, email, password, roles } = data;
  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Username must be a string and at least 3 characters long.' });
  }
  if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Invalid email format.' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Password must be a string and at least 8 characters long.' });
  }
  // Optional: Validate roles if provided
  if (roles && (!Array.isArray(roles) || !roles.every(role => typeof role === 'string'))) {
    throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Roles must be an array of strings.' });
  }
  return { username: username.trim(), email: email.trim().toLowerCase(), passwordPlainText: password, roles };
};

const validateLoginInput = (data: any): LoginUserDto => {
  const { emailOrUsername, password } = data;
  if (!emailOrUsername || typeof emailOrUsername !== 'string' || emailOrUsername.trim().length === 0) {
    throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Email or username is required.' });
  }
  if (!password || typeof password !== 'string' || password.length === 0) {
    throw new AppError({ httpCode: HttpCode.BAD_REQUEST, description: 'Password is required.' });
  }
  return { emailOrUsername: emailOrUsername.trim(), passwordPlainText: password };
};


class AuthController {
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const registerDto = validateRegisterInput(req.body);
      const result = await AuthService.register(registerDto);
      res.status(HttpCode.CREATED).json(result);
    } catch (error) {
      // If error is an AppError, pass it to the global error handler
      // Otherwise, wrap it or handle it appropriately
      if (error instanceof AppError) {
        next(error);
      } else if (error instanceof Error) { // Catch other generic errors
        next(new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: error.message || 'An unexpected error occurred during registration.'}));
      } else {
         next(new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'An unexpected error occurred during registration.'}));
      }
    }
  }

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const loginDto = validateLoginInput(req.body);
      const result = await AuthService.login(loginDto);

      // Example of setting cookie (optional, consider security implications like HttpOnly, Secure, SameSite)
      // res.cookie('jwt', result.token, {
      //   httpOnly: true,
      //   secure: config.nodeEnv === 'production',
      //   maxAge: 24 * 60 * 60 * 1000 // 1 day, should match token expiry
      // });

      res.status(HttpCode.OK).json(result);
    } catch (error) {
      if (error instanceof AppError) {
        next(error);
      } else if (error instanceof Error) {
        next(new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: error.message || 'An unexpected error occurred during login.'}));
      } else {
        next(new AppError({ httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'An unexpected error occurred during login.'}));
      }
    }
  }

  public async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    // This route will be protected by auth middleware, which adds 'user' to req
    // @ts-ignore // Assuming 'user' will be populated by middleware
    const user = req.user;

    if (!user) {
      // This case should ideally be handled by the auth middleware not finding a user
      return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'No user data found. Ensure token is valid.' }));
    }
    // We don't want to send back the JWT 'iat' and 'exp' fields, or other sensitive data from token
    // The auth middleware should ideally populate req.user with a sanitized user object from DB or token
    res.status(HttpCode.OK).json({
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        // any other fields deemed safe to return from the token payload or a fresh DB query
    });
  }

  // Placeholder for logout if using session-based or cookie invalidation on server
  // For JWT, logout is typically client-side (deleting the token).
  // If using refresh tokens, server-side invalidation of refresh token might be needed.
  // public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  //   try {
  //     // Clear cookie if used
  //     // res.clearCookie('jwt');
  //     res.status(HttpCode.OK).json({ message: 'Logged out successfully' });
  //   } catch (error) {
  //     next(error);
  //   }
  // }
}

export default new AuthController();
