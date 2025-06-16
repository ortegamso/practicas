import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { AppError, HttpCode } from '../utils/appError';
import User, { IUser, UserRole } from '../models/mongodb/user.model'; // To potentially fetch fresh user data

// Define a new interface for Express Request object to include 'user'
export interface AuthenticatedRequest extends Request {
  user?: { // This should match the structure of your JWT payload or the user object you want to attach
    id: string;
    username: string;
    email: string;
    roles: UserRole[];
    // Add other fields from your JWT payload if necessary
  };
}

export const protect = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  let token;

  // Check for token in Authorization header (Bearer token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // else if (req.cookies && req.cookies.jwt) { // Optional: Check for token in cookies
  //   token = req.cookies.jwt;
  // }

  if (!token) {
    return next(new AppError({
        httpCode: HttpCode.UNAUTHORIZED,
        description: 'Not authorized, no token provided.'
    }));
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret) as { id: string; username: string; email: string; roles: UserRole[]; iat: number; exp: number };

    // Attach user to request object.
    // Option 1: Attach decoded payload directly (simple, but data might be stale if roles/info changed after token issuance)
    req.user = {
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        roles: decoded.roles,
    };

    // Option 2: Fetch fresh user data from DB (more secure, always up-to-date, but adds DB call)
    // This is generally recommended for sensitive operations or if user data changes frequently.
    /*
    const freshUser = await User.findById(decoded.id).select('-passwordHash'); // Exclude password
    if (!freshUser) {
      return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'User belonging to this token no longer exists.' }));
    }
    if (!freshUser.isActive) {
        return next(new AppError({ httpCode: HttpCode.FORBIDDEN, description: 'User account is inactive.'}));
    }
    req.user = {
        id: freshUser.id,
        username: freshUser.username,
        email: freshUser.email,
        roles: freshUser.roles,
    };
    */

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'Not authorized, token expired.' }));
    }
    if (error instanceof jwt.JsonWebTokenError) {
        return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'Not authorized, token invalid.' }));
    }
    // For other errors during verification
    console.error("Token verification error:", error);
    return next(new AppError({ httpCode: HttpCode.UNAUTHORIZED, description: 'Not authorized, token verification failed.' }));
  }
};

// Middleware to restrict access based on roles
export const authorize = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.roles) {
      return next(new AppError({
          httpCode: HttpCode.UNAUTHORIZED,
          description: 'Not authorized, user data or roles missing from request.'
      }));
    }

    const hasRequiredRole = req.user.roles.some(role => allowedRoles.includes(role));

    if (!hasRequiredRole) {
      return next(new AppError({
          httpCode: HttpCode.FORBIDDEN,
          description: \`Forbidden. User roles (\${req.user.roles.join(', ')}) do not include required roles (\${allowedRoles.join(', ')}).\`
      }));
    }
    next();
  };
};

// Example of a more specific role middleware
export const isAdmin = authorize([UserRole.ADMIN]);
export const isTrader = authorize([UserRole.TRADER, UserRole.ADMIN]); // Admins can also trade
export const isDeveloper = authorize([UserRole.DEVELOPER, UserRole.ADMIN]); // Admins can also develop

EOL
