// Shared outbound HTTP helper. Only call it with fixed hosts or hosts validated by requireUrl().
import { HttpError } from './response.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export async function upstreamFetch(url, { method = 'GET', headers = {}, body, redirect = 'follow', timeout = 8000 } = {}) {
  try {
    return await fetch(url, {
      method,
      body,
      redirect,
      headers: { 'User-Agent': DEFAULT_UA, ...headers },
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new HttpError(504, 'Upstream timeout', 'Upstream did not respond in time', 'TimeoutError');
    }
    throw new HttpError(502, 'Upstream unreachable', 'Could not reach the upstream service', 'UpstreamError');
  }
}
