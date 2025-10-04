const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const favoritesRouter = require('./routes/favorites');
const notificationsRouter = require('./routes/notifications');
const { startBackgroundJobs } = require('./services/backgroundJobs');
const { initializeRedis } = require('./services/cacheService');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// CORS configuration
app.use(cors({
  origin: ['http://localhost:8081', 'http://localhost:19006'], // Expo dev servers
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/favorites', favoritesRouter);
app.use('/api/notifications', notificationsRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize services and start server
async function startServer() {
  // Try to initialize Redis but don't let failures prevent the server from starting.
  try {
    await initializeRedis();
    console.log('✅ Redis connected');
  } catch (err) {
    console.error('⚠️ Redis initialization failed (will continue without cache):', err.message || err);
  }

  // Start background jobs. They may rely on Redis internally but should handle missing Redis gracefully.
  try {
    startBackgroundJobs();
    console.log('✅ Background jobs started');
  } catch (err) {
    console.error('⚠️ Failed to start background jobs (continuing):', err.message || err);
  }

  // Start the server regardless of Redis/background job status so healthchecks can pass.
  try {
    app.listen(PORT, () => {
      console.log(`🚀 Sports Tracker Backend running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('❌ Failed to start server listener:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();

module.exports = app;