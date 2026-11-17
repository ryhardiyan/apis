// Application metadata and runtime configuration (read from environment variables).
export const APP = {
  name: 'RyharDev API',
  version: '1.0.0',
  description: 'RyharDev API adalah REST API JSON multifungsi yang dibangun dengan Node.js dan mendukung sistem plugin.',
  creator: 'RyharDev',
  developer: 'rahardiyan.sang.ceo',
  license: 'MIT',
  repository: 'https://github.com/your-username/ryhardev-api', // ganti dengan URL repository Anda
};

export const CONFIG = {
  corsOrigin: process.env.CORS_ORIGIN || '*',
  maxBodySize: process.env.MAX_BODY_SIZE || '100kb',
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 60,
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 15000,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '62',
  disabledPlugins: (process.env.DISABLED_PLUGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
