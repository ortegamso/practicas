import config from './index'; // Main app config for port, apiBaseUrl

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Crypto Trading Bot & Marketplace API',
    version: '1.0.0', // Corresponds to your API version
    description:
      'API documentation for the Crypto Trading Bot, E-commerce, Marketplace, and supporting services. ' +
      'This platform provides functionalities for automated trading, script marketplace, user management, and more.',
    license: {
      name: 'MIT', // Or your project's license
      url: 'https://spdx.org/licenses/MIT.html',
    },
    contact: {
      name: 'Support Team',
      url: 'https://your-support-url.com', // Replace with actual support URL
      email: 'support@example.com',    // Replace with actual support email
    },
  },
  servers: [
    {
      url: \`http://localhost:\${config.port}\${config.apiBaseUrl.replace(\`http://localhost:\${config.port}\`, '')}\`, // Construct server URL relative to apiBaseUrl
      description: 'Development server',
    },
    // You can add more servers here (e.g., staging, production)
    // {
    //   url: 'https://api.yourproductiondomain.com/api/v1',
    //   description: 'Production server',
    // }
  ],
  // Schemas (components) can be defined globally here or within JSDoc annotations
  // It's often cleaner to define common request/response DTOs as components.
  components: {
    // --- Security Schemas (e.g., for JWT) ---
    securitySchemes: {
      bearerAuth: { // Can be any name, this is commonly used
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT', // Optional, for documentation
        description: "Enter JWT Bearer token in the format: Bearer <token>"
      }
    },
    // --- Common Schemas (DTOs) ---
    // Example: Define User and Auth related DTOs used in multiple places
    schemas: {
      // --- Auth Schemas ---
      UserLoginRequest: {
        type: 'object',
        required: ['emailOrUsername', 'password'],
        properties: {
          emailOrUsername: { type: 'string', example: 'user@example.com' },
          password: { type: 'string', format: 'password', example: 'yourpassword' },
        },
      },
      UserRegisterRequest: {
        type: 'object',
        required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', example: 'newuser' },
          email: { type: 'string', format: 'email', example: 'newuser@example.com' },
          password: { type: 'string', format: 'password', example: 'strongpassword123' },
          roles: { type: 'array', items: { type: 'string', enum: ['user', 'admin', 'trader', 'developer'] }, example: ['user'] }
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'objectid', example: '60d0fe4f5311236168a109ca' },
              username: { type: 'string', example: 'newuser' },
              email: { type: 'string', format: 'email', example: 'newuser@example.com' },
              roles: { type: 'array', items: { type: 'string' }, example: ['user'] },
            },
          },
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          expiresIn: { type: 'string', example: '1d' },
        },
      },
      UserProfileResponse: { // For GET /me
        type: 'object',
        properties: {
            id: { type: 'string', format: 'objectid', example: '60d0fe4f5311236168a109ca' },
            username: { type: 'string', example: 'currentuser' },
            email: { type: 'string', format: 'email', example: 'currentuser@example.com' },
            roles: { type: 'array', items: { type: 'string' }, example: ['user'] },
        }
      },
      // --- Product Schemas ---
      Product: { // Based on IProduct model, simplified for response
        type: 'object',
        properties: {
          id: { type: 'string', format: 'objectid' },
          name: { type: 'string', example: 'Trading Bot Alpha' },
          slug: { type: 'string', example: 'trading-bot-alpha' },
          description: { type: 'string', example: 'An advanced trading bot.' },
          price: { type: 'number', format: 'float', example: 99.99 },
          currency: { type: 'string', example: 'USD' },
          category: { type: 'string', example: 'trading_bot' },
          tags: { type: 'array', items: { type: 'string' }, example: ['algo', 'HFT'] },
          stock: { type: 'integer', nullable: true, example: 100 },
          images: { type: 'array', items: { type: 'string', format: 'url' }, example: ['https://example.com/image.jpg'] },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        }
      },
      ProductListResponse: {
        type: 'object',
        properties: {
            products: { type: 'array', items: { \$ref: '#/components/schemas/Product'} },
            total: { type: 'integer', example: 100 },
            page: { type: 'integer', example: 1 },
            pages: { type: 'integer', example: 10 }
        }
      },
      // --- Error Schemas ---
      ErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Error message description.' },
          stack: { type: 'string', example: 'Error stack trace (in development).' } // Optional
        }
      },
      NotFoundErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Resource not found.' }
        }
      },
      UnauthorizedErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Not authorized or token expired.' }
        }
      },
      BadRequestErrorResponse: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Invalid input: Field X is required.' }
        }
      }
    }
  },
  // Define global security requirement (e.g., all protected routes use bearerAuth)
  // This can be overridden at the operation level.
  // security: [
  //   {
  //     bearerAuth: [] // Empty array means this security scheme is active
  //   }
  // ]
};

// Options for swagger-jsdoc
const swaggerOptions = {
  swaggerDefinition,
  // Path to the API docs (e.g., JSDoc comments in your route files)
  // Glob pattern to find all your route files.
  apis: ['./src/routes/**/*.ts', './src/controllers/**/*.ts', './src/models/mongodb/*.ts'],
  // It's good to include models if you define schemas there via JSDoc for swagger-jsdoc to pick up.
  // Or define them in components.schemas above.
};

export default swaggerOptions;

console.log('Swagger configuration (swagger.config.ts) loaded.');
