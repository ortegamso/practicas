import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
// import { rateLimit } from 'express-rate-limit'; // Consider adding later for security
import authRouter from './auth/auth.routes';
import tradingRouter from './routes/trading/index';
import storeRouter from './routes/store/index';
import referralRouter from './routes/referrals/referral.routes';
import supportTicketRouter from './routes/support/supportTicket.routes';
import marketplaceRouter from './routes/marketplace/marketplace.routes';
import analyticsRouter from './routes/analytics/analytics.routes';
import adminUserManagementRouter from './routes/admin/userManagement.routes';

// Import routers (to be created later)

const app: Application = express();

// --- Middlewares ---
// Enable CORS
app.use(cors()); // Configure with specific origins in production

// Secure HTTP headers
app.use(helmet());

// HTTP request logger
app.use(morgan('dev')); // 'combined' for production, or custom format

// Body parsers
app.use(express.json({ limit: '10mb' })); // Adjust limit as needed
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (example, configure as needed)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   standardHeaders: true, // Return rate limit info in the \`RateLimit-*\` headers
//   legacyHeaders: false, // Disable the \`X-RateLimit-*\` headers
// });
// app.use('/api', limiter); // Apply to all /api routes or specific ones

// --- Routes ---
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', message: 'Backend is healthy' });
});

// Placeholder for API versioning
const apiVersion = '/api/v1';

app.use(\`\${apiVersion}/auth\`, authRouter);
app.use(\`\${apiVersion}/trading\`, tradingRouter);
app.use(\`\${apiVersion}/store\`, storeRouter);
app.use(\`\${apiVersion}/referrals\`, referralRouter);
app.use(\`\${apiVersion}/support-tickets\`, supportTicketRouter);
app.use(\`\${apiVersion}/marketplace\`, marketplaceRouter);
app.use(\`\${apiVersion}/analytics\`, analyticsRouter);
app.use(\`\${apiVersion}/admin\`, adminUserManagementRouter); // Mount admin routes under /admin
// ... other main routes

// --- Not Found Handler ---
// For any requests that don't match a route
app.use((req: Request, res: Response, next: NextFunction) => {
  const error = new Error(\`Not Found - \${req.originalUrl}\`);
  res.status(404);
  next(error);
});

// --- Global Error Handler ---
// Catches all errors passed via next(error)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
// TODO:LOGGING: Replace console.error with structured logging (Winston) here. Include trace ID, userId (if available), request details.
// TODO:METRICS: Increment an error counter metric (e.g., http_server_errors_total) with labels for status_code, path, method.
  console.error(\`[ERROR] \${statusCode} - \${err.message} - \${req.originalUrl} - \${req.method} - \${req.ip}\`);
  console.error(err.stack); // Log stack trace for debugging

  res.json({
    message: err.message,
    // Provide stack trace in development only for security reasons
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
  });
});

export default app;
