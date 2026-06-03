import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import db from './config/database.js';

const app = express();

// ─── SECURITY ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

// Rate limit toàn bộ API (chỉ production)
if (process.env.NODE_ENV === 'production') {
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { success: false, message: 'Quá nhiều request, thử lại sau' },
    standardHeaders: true,
    legacyHeaders: false,
  }));
}


// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['https://lms-fe-blue.vercel.app', 'http://localhost:3000', 'http://localhost:8081', 'http://127.0.0.1:5500'];

const corsOriginSet = new Set(allowedOrigins);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // mobile app, Postman, curl
    if (corsOriginSet.has(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ─── BODY PARSING ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── REQUEST LOGGING (dev only) ───────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toLocaleTimeString('vi-VN')}] ${req.method} ${req.path}`);
    next();
  });
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/', async (_req, res) => {
  let dbStatus = 'unknown';
  try {
    await db.query('SELECT 1');
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error';
  }
  const isProduction = process.env.NODE_ENV === 'production';
  res.json({
    success: true,
    message: 'LMS API Server',
    ...(isProduction ? {} : {
      version: '3.0.0',
      env: process.env.NODE_ENV,
      db: dbStatus,
      uptime: `${Math.floor(process.uptime())}s`,
    }),
  });
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route không tồn tại: ${req.method} ${req.path}` });
});

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── KHỞI ĐỘNG ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;

async function start() {
  // Kiểm tra kết nối DB trước khi mở port
  try {
    await db.query('SELECT 1');
    console.log('✅ Database connected');
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    console.error('   Kiểm tra DB_PASSWORD trong .env và Supabase đang hoạt động');
    process.exit(1); // Không khởi động nếu DB lỗi
  }

  // Lắng nghe trên 0.0.0.0 để BlueStacks/emulator kết nối được
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT} (0.0.0.0)`);
    console.log(`📡 API: http://localhost:${PORT}/api`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📱 Mobile (emulator): http://10.0.2.2:${PORT}/api`);
    }
  });
}

// ─── XỬ LÝ LỖI TOÀN CỤC ──────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received — shutting down gracefully');
  db.end?.().finally(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received — shutting down');
  process.exit(0);
});

start();
