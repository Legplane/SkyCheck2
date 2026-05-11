import path from 'path';
import dotenv from 'dotenv';

// Resolve .env from this package root (works even if process.cwd() is the monorepo or IDE root)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRoutes         from './routes/auth';
import weatherRoutes      from './routes/weather';
import routeRoutes        from './routes/routes';
import alertRoutes        from './routes/alerts';
import healthRoutes       from './routes/health';
import announcementRoutes from './routes/announcements';
import { startRiskCron, startMorningAlertCron } from './services/cronService';
import { clearStaleBasis } from './utils/clearStaleBasis';
import { getTomTomStatus } from './services/trafficService';

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[Server] Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

if (!process.env.GOOGLE_CLIENT_ID?.trim()) {
  console.warn('[Server] GOOGLE_CLIENT_ID is unset — Google sign-in returns "not configured" until you add it to .env (or deployment env).');
}

const app  = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:5173',
  'http://localhost:5173',
  'http://localhost:4173',
  // Add your LAN IP here if needed, e.g. 'http://192.168.1.21:5173'
  ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(',') : []),
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (Postman, mobile PWA, same-device)
    if (!origin) return cb(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o.replace(/\/$/, '')))) {
      return cb(null, true);
    }
    // In development, allow all origins to simplify LAN testing
    if (process.env.NODE_ENV !== 'production') {
      return cb(null, true);
    }
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
}));

app.get('/health-check-server', (_req, res) => res.json({
  status: 'ok',
  version: '2.0.0',
  timestamp: new Date().toISOString(),
  traffic: {
    tomtom: getTomTomStatus(),
  },
}));

// Legacy health endpoint alias
app.get('/health-server', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth',          authRoutes);
app.use('/weather',       weatherRoutes);
app.use('/routes',        routeRoutes);
app.use('/alerts',        alertRoutes);
app.use('/health',        healthRoutes);
app.use('/announcements', announcementRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`\n🌤  SkyCheck Backend v2.0 → http://localhost:${PORT}`);
  console.log(`    Health: http://localhost:${PORT}/health-check-server`);

  const disableCron = (process.env.DISABLE_CRON?.trim().toLowerCase() || 'false') === 'true';
  if (process.env.NODE_ENV !== 'test' && !disableCron) {
    // Clear any stale risk data from DB before starting cron
    clearStaleBasis().then(() => {
      startRiskCron();
      startMorningAlertCron();
    });
  } else if (disableCron) {
    console.log('[Cron] Disabled by DISABLE_CRON=true');
  }
});

export default app;
