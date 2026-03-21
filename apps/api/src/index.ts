import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config.js';
import logger from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { supabaseAdmin } from './supabase.js';

// Import routes
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import dashboardRoutes from './routes/dashboard.js';
import forumRoutes from './routes/forum.js';
import moderationRoutes from './routes/moderation.js';
import notificationsRoutes from './routes/notifications.js';
import usersRoutes from './routes/users.js';
import eventsRoutes from './routes/events.js';

const app = express();

// Vercel (and most reverse proxies) set X-Forwarded-For.
// Without this, express-rate-limit throws a ValidationError.
app.set('trust proxy', 1);

// =====================================================
// MIDDLEWARE
// =====================================================

// Security headers
app.use(helmet({
  // Allow embedding in Lovable / kumii.africa iframes
  frameguard: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      frameAncestors: [
        "'self'",
        "https://kumii.africa",
        "https://*.lovable.app",
        "https://*.lovableproject.com",
        "https://*.gptengineer.app",
      ],
    },
  },
}));

// CORS
const ALLOWED_ORIGINS = [
  config.CORS_ORIGIN,
  'https://kumii.africa',
  'https://www.kumii.africa',
  // The iframe calls /api/auth/exchange from its own origin — must be allowed.
  // In production this is communities-ten.vercel.app; allow all *.vercel.app
  // preview deployments too.
  'https://communities-ten.vercel.app',
].filter(Boolean);

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+\.gptengineer\.app$/,
  /^https:\/\/[a-z0-9-]+-[a-z0-9]+-[a-z0-9]+\.vercel\.app$/,   // preview deployments
  /^https:\/\/communities-ten\.vercel\.app$/,                     // production
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (ALLOWED_ORIGIN_PATTERNS.some(p => p.test(origin))) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
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

// ── Per-route write rate limiters ────────────────────────────────────────────
// These are much tighter than the global limiter and keyed by authenticated
// user ID (falls back to IP for unauthenticated hits).

const keyByUser = (req: express.Request) =>
  (req as any).user?.id ?? req.ip ?? 'unknown';

/** 30 messages per minute per user */
const chatWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.NODE_ENV === 'development' ? 500 : 30,
  keyGenerator: keyByUser,
  message: { success: false, error: 'You are sending messages too fast. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** 10 new threads + 60 posts per 10 minutes per user */
const forumWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: config.NODE_ENV === 'development' ? 500 : 60,
  keyGenerator: keyByUser,
  message: { success: false, error: 'You are posting too fast. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** 5 reports per hour per user (anti-abuse) */
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: config.NODE_ENV === 'development' ? 500 : 5,
  keyGenerator: keyByUser,
  message: { success: false, error: 'Report limit reached. Please try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

// ── last_seen_at heartbeat ────────────────────────────────────────────────────
// Update profiles.last_seen_at at most once every 60 seconds per user.
// Uses a simple in-memory timestamp map — resets on server restart, which is
// acceptable (Vercel serverless restarts are frequent anyway).
const lastSeenCache = new Map<string, number>();

app.use((req: express.Request, _res, next) => {
  const userId = (req as any).user?.id;
  if (!userId) return next();

  const now = Date.now();
  const last = lastSeenCache.get(userId) ?? 0;
  if (now - last > 60_000) {
    lastSeenCache.set(userId, now);
    void supabaseAdmin
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', userId);
  }
  next();
});

// =====================================================
// ROUTES
// =====================================================

// Health check - accessible at both /health and /api/health for compatibility
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

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatWriteLimiter, chatRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/forum', forumWriteLimiter, forumRoutes);
app.use('/api/moderation', reportLimiter, moderationRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/events', eventsRoutes);

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
