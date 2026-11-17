// JSON response helpers, error class, and shared input validators.
import { APP } from './config.js';

export class HttpError extends Error {
  constructor(code = 400, message = 'Invalid request', details = 'Invalid parameters', type = 'ValidationError') {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.details = details;
    this.type = type;
  }
}

export function success(res, data = null, message = 'Request successful', code = 200) {
  return res.status(code).json({ status: true, code, creator: APP.creator, message, data });
}

export function failure(res, code, message, type, details) {
  return res.status(code).json({
    status: false,
    code,
    creator: APP.creator,
    message,
    error: { type, details },
  });
}

export function requireString(value, name, { max = 10000, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, 'Invalid request', `Parameter "${name}" is required`);
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Invalid request', `Parameter "${name}" must be a string`);
  }
  if (value.length > max) {
    throw new HttpError(400, 'Invalid request', `Parameter "${name}" must not exceed ${max} characters`);
  }
  return value;
}

// Validates an absolute https URL. If allowedHosts is given, the hostname must be in the list.
export function requireUrl(value, name, allowedHosts = null) {
  const raw = requireString(value, name, { max: 2048 });
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, 'Invalid request', `Parameter "${name}" must be a valid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new HttpError(400, 'Invalid request', `Parameter "${name}" must use https`);
  }
  if (url.username || url.password) {
    throw new HttpError(400, 'Invalid request', `Parameter "${name}" must not contain credentials`);
  }
  if (allowedHosts && !allowedHosts.includes(url.hostname)) {
    throw new HttpError(400, 'Invalid request', 'URL host is not supported by this endpoint');
  }
  return url.toString();
}
