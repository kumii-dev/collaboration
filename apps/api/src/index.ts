import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config.js';
import logger from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Import routes
import chatRoutes from './routes/chat.js';
import forumRoutes from './routes/forum.js';
import moderationRoutes from './routes/moderation.js';
import notificationsRoutes from './routes/notifications.js';
import usersRoutes from './routes/users.js';

const app = express();

// =====================================================
// MIDDLEWARE
// =====================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true,
}));

// Rate limiting - more lenient in development
const limiter = rateLimit({
  windowMs: parseInt(config.RATE_LIMIT_WINDOW_MS),
  max: config.NODE_ENV === 'development' ? 1000 : parseInt(config.RATE_LIMIT_MAX_REQUESTS), // 1000 requests in dev
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  },
});

app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// =====================================================
// ROUTES
// =====================================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
    },
  });
});

app.use('/api/chat', chatRoutes);
app.use('/api/forum', forumRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/users', usersRoutes);

// =====================================================
// ERROR HANDLING
// =====================================================

app.use(notFoundHandler);
app.use(errorHandler);

// =====================================================
// =====================================================
// START SERVER
// =====================================================

// Only start the server if not running on Vercel (serverless environment)
if (process.env.VERCEL !== '1') {
  const PORT = parseInt(config.PORT);

  const server = app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📝 Environment: ${config.NODE_ENV}`);
    logger.info(`🔗 API URL: ${config.API_URL}`);
    logger.info(`🌐 CORS Origin: ${config.CORS_ORIGIN}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, closing server gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, closing server gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });
}

export default app;
