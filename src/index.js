// Core application: middleware, docs, core routes, plugins, and error handling.
import express from 'express';
import { CONFIG } from './config.js';
import { failure, HttpError } from './response.js';
import { loadPlugins, mountPlugins, createCoreRouter } from './router.js';
import { mountDocs } from './swagger.js';

// Plugins are loaded once per serverless instance (cold start).
const { plugins, disabled, errors } = await loadPlugins();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // Vercel forwards the client IP through proxy headers

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CONFIG.corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Request timeout
app.use((req, res, next) => {
  res.setTimeout(CONFIG.requestTimeoutMs, () => {
    if (!res.headersSent) {
      failure(res, 504, 'Request timeout', 'TimeoutError', 'The request took too long to process');
    }
  });
  next();
});

// In-memory rate limit. Note: on serverless this is per instance, not global.
// Use an external store (e.g. Redis/Upstash) for strict limits in production.
const WINDOW_MS = 60_000;
const hits = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  let entry = hits.get(key);
  if (!entry || now - entry.start >= WINDOW_MS) {
    if (hits.size > 10_000) hits.clear(); // memory guard
    entry = { start: now, count: 0 };
    hits.set(key, entry);
  }
  entry.count += 1;
  res.setHeader('X-RateLimit-Limit', CONFIG.rateLimitMax);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, CONFIG.rateLimitMax - entry.count));
  if (entry.count > CONFIG.rateLimitMax) {
    res.setHeader('Retry-After', Math.ceil((WINDOW_MS - (now - entry.start)) / 1000));
    return failure(res, 429, 'Too many requests', 'RateLimitError', 'Rate limit exceeded, please retry later');
  }
  next();
}
app.use('/api', rateLimit);

// Request body size limit is enforced here
app.use(express.json({ limit: CONFIG.maxBodySize }));

app.get('/', (req, res) => res.redirect('/docs'));

mountDocs(app, plugins);
app.use(createCoreRouter({ plugins, errors, disabled }));
mountPlugins(app, plugins);

// 404
app.use((req, res) =>
  failure(res, 404, 'Endpoint not found', 'NotFoundError', `Route ${req.method} ${req.path} does not exist`),
);

// Error handler: never exposes stack traces or internal details to clients
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return failure(res, err.code, err.message, err.type, err.details);
  if (err.type === 'entity.too.large') {
    return failure(res, 413, 'Payload too large', 'PayloadError', 'Request body exceeds the allowed size');
  }
  if (err.type === 'entity.parse.failed') {
    return failure(res, 400, 'Invalid request', 'ValidationError', 'Request body is not valid JSON');
  }
  console.error('[error]', req.method, req.path, err);
  return failure(res, 500, 'Internal server error', 'ServerError', 'An unexpected error occurred');
});

export default app;
