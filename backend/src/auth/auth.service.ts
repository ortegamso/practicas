import User, { IUser, UserRole } from '../models/mongodb/user.model';
import jwt from 'jsonwebtoken';
import config from '../config';
import { AppError, HttpCode } from '../utils/appError'; // To be created
import NotificationService from '../notifications/notification.service';

// Define interfaces for service method parameters
export interface RegisterUserDto {
  username: string;
  email: string;
  passwordPlainText: string; // Changed from 'password' to be explicit
  roles?: UserRole[];
}

export interface LoginUserDto {
  emailOrUsername: string;
  passwordPlainText: string; // Changed from 'password'
}

export interface AuthResponse {
  user: {
    id: string;
    username: string;
    email: string;
    roles: UserRole[];
  };
  token: string;
  expiresIn: string; // Or number (seconds)
}

class AuthService {
  public async register(userData: RegisterUserDto): Promise<AuthResponse> {
    const { username, email, passwordPlainText, roles } = userData;

    // Check if user already exists by email or username
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      if (existingUser.email === email) {
        throw new AppError({
            httpCode: HttpCode.CONFLICT,
            description: 'User with this email already exists.',
        });
      }
      if (existingUser.username === username) {
        throw new AppError({
            httpCode: HttpCode.CONFLICT,
            description: 'User with this username already exists.',
        });
      }
    }

    // Password strength check (basic example)
    if (passwordPlainText.length < 8) {
        throw new AppError({
            httpCode: HttpCode.BAD_REQUEST,
            description: 'Password must be at least 8 characters long.',
        });
    }

    // Create new user instance. The password will be hashed by the pre-save hook in the model
    // by assigning the plain text password to passwordHash field.
    const newUser = new User({
      username,
      email,
      passwordHash: passwordPlainText, // Assign plain text here, pre-save hook will hash it
      roles: roles || [UserRole.USER], // Default role
      isActive: true, // Or set to false and implement email verification
      isEmailVerified: false,
    });

    try {
      await newUser.save();

    // Send welcome email (fire and forget, don't block registration on email failure)
    NotificationService.sendWelcomeEmail({ email: newUser.email, username: newUser.username }).catch(err => {
      console.error(\`[AuthService] Failed to send welcome email to \${newUser.email} after registration:\`, err);
    });
    } catch (error: any) {
      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        // Construct a user-friendly error message from validation errors
        const messages = Object.values(error.errors).map((err: any) => err.message).join(' ');
        throw new AppError({httpCode: HttpCode.BAD_REQUEST, description: messages});
      }
          // TODO:LOGGING: Use structured logger (Winston) for this error, include relevant context (e.g., username, email).
      console.error("Error during user save:", error);
      throw new AppError({httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Error registering user.'});
    }

    // TODO:LOGGING: Log successful registration/login event (user ID, username). Audit log.
    // TODO:METRICS: Increment user_registrations_total or user_logins_total metric.
    // Generate JWT
    const tokenPayload = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      roles: newUser.roles,
    };

    const token = jwt.sign(tokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    return {
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        roles: newUser.roles,
      },
      token,
      expiresIn: config.jwt.expiresIn,
    };
  }

  public async login(loginData: LoginUserDto): Promise<AuthResponse> {
    const { emailOrUsername, passwordPlainText } = loginData;

    // Find user by email or username
    const user = await User.findOne({
      $or: [{ email: emailOrUsername.toLowerCase() }, { username: emailOrUsername }],
    }).select('+passwordHash'); // Explicitly select passwordHash as it might be excluded by default

    if (!user) {
      throw new AppError({httpCode: HttpCode.UNAUTHORIZED, description: 'Invalid credentials.'});
    }

    if (!user.passwordHash) {
        // This case should ideally not happen if users are created correctly
        console.error(\`User \${user.id} found without a passwordHash.\`);
        throw new AppError({httpCode: HttpCode.INTERNAL_SERVER_ERROR, description: 'Authentication error.'});
    }

    // Compare password
    const isMatch = await user.comparePassword(passwordPlainText);
    if (!isMatch) {
      throw new AppError({httpCode: HttpCode.UNAUTHORIZED, description: 'Invalid credentials.'});
    }

    if (!user.isActive) {
        throw new AppError({httpCode: HttpCode.FORBIDDEN, description: 'Account is inactive. Please contact support.'});
    }

    // Generate JWT
    const tokenPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
      roles: user.roles,
    };

    // TODO:LOGGING: Log successful registration/login event (user ID, username). Audit log.
    // TODO:METRICS: Increment user_registrations_total or user_logins_total metric.
    const token = jwt.sign(tokenPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        roles: user.roles,
      },
      token,
      expiresIn: config.jwt.expiresIn,
    };
  }
}

export default new AuthService();
