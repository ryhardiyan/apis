// Utility tools: Base64, hash, URL parser, timestamp, random generator, JSON formatter, IP info.
import crypto from 'node:crypto';
import net from 'node:net';
import { success, requireString, HttpError } from '../../src/response.js';

const HASH_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'];
const MAX_TEXT = 100000;

function toInt(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new HttpError(400, 'Invalid request', `Parameter "${name}" must be an integer`);
  return n;
}

function parseTimestamp(value) {
  if (value === undefined || value === '') return new Date();
  const raw = requireString(value, 'value', { max: 64 }).trim();
  let date;
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    date = new Date(Math.abs(n) < 1e11 ? n * 1000 : n); // <= 10 digits: seconds, otherwise milliseconds
  } else {
    date = new Date(raw);
  }
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Invalid request', 'Parameter "value" is not a valid timestamp or date');
  }
  return date;
}

export default {
  name: 'utility',
  description: 'Tools utilitas: Base64, hash, URL parser, timestamp converter, random generator, JSON formatter, dan IP info.',
  version: '1.0.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'post',
      path: '/base64',
      summary: 'Base64 encode / decode',
      description: 'Encode teks UTF-8 ke Base64, atau decode Base64 kembali ke teks.',
      requestBody: {
        type: 'object',
        required: ['action', 'text'],
        properties: {
          action: { type: 'string', enum: ['encode', 'decode'] },
          text: { type: 'string', maxLength: MAX_TEXT },
        },
      },
      requestExample: { action: 'encode', text: 'Halo RyharDev' },
      example: { action: 'encode', result: 'SGFsbyBSeWhhckRldg==' },
      handler(req, res) {
        const { action } = req.body ?? {};
        const input = requireString(req.body?.text, 'text', { max: MAX_TEXT });
        if (action === 'encode') {
          return success(res, { action, result: Buffer.from(input, 'utf8').toString('base64') }, 'Encoded successfully');
        }
        if (action === 'decode') {
          if (!/^[A-Za-z0-9+/=\s]*$/.test(input)) {
            throw new HttpError(400, 'Invalid request', 'Input is not valid Base64');
          }
          return success(res, { action, result: Buffer.from(input, 'base64').toString('utf8') }, 'Decoded successfully');
        }
        throw new HttpError(400, 'Invalid request', 'Parameter "action" must be "encode" or "decode"');
      },
    },
    {
      method: 'post',
      path: '/hash',
      summary: 'Generate hash',
      description: 'Menghasilkan hash (md5, sha1, sha256, sha512) dari teks. Gunakan untuk checksum, bukan untuk menyimpan password.',
      requestBody: {
        type: 'object',
        required: ['algorithm', 'text'],
        properties: {
          algorithm: { type: 'string', enum: HASH_ALGORITHMS },
          text: { type: 'string', maxLength: MAX_TEXT },
        },
      },
      requestExample: { algorithm: 'sha256', text: 'hello' },
      example: { algorithm: 'sha256', hash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' },
      handler(req, res) {
        const algorithm = String(req.body?.algorithm ?? '').toLowerCase();
        if (!HASH_ALGORITHMS.includes(algorithm)) {
          throw new HttpError(400, 'Invalid request', `Parameter "algorithm" must be one of ${HASH_ALGORITHMS.join(', ')}`);
        }
        const input = requireString(req.body?.text, 'text', { max: MAX_TEXT });
        const hash = crypto.createHash(algorithm).update(input, 'utf8').digest('hex');
        success(res, { algorithm, hash }, 'Hash generated');
      },
    },
    {
      method: 'get',
      path: '/url',
      summary: 'Parse URL',
      description: 'Memecah URL menjadi komponen-komponennya. Endpoint ini tidak melakukan request ke URL tersebut.',
      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description: 'URL yang akan diparse',
          schema: { type: 'string', maxLength: 2048 },
          example: 'https://example.com:8080/path?lang=id&q=api#top',
        },
      ],
      example: {
        protocol: 'https:',
        hostname: 'example.com',
        port: '8080',
        pathname: '/path',
        search: '?lang=id&q=api',
        hash: '#top',
        params: { lang: 'id', q: 'api' },
      },
      handler(req, res) {
        const raw = requireString(req.query.url, 'url', { max: 2048 });
        let url;
        try {
          url = new URL(raw);
        } catch {
          throw new HttpError(400, 'Invalid request', 'Parameter "url" must be a valid absolute URL');
        }
        success(
          res,
          {
            href: url.href,
            origin: url.origin,
            protocol: url.protocol,
            username: url.username,
            hostname: url.hostname,
            port: url.port,
            pathname: url.pathname,
            search: url.search,
            hash: url.hash,
            params: Object.fromEntries(url.searchParams.entries()),
          },
          'URL parsed',
        );
      },
    },
    {
      method: 'get',
      path: '/timestamp',
      summary: 'Convert timestamp',
      description: 'Mengonversi Unix timestamp (detik/milidetik) atau tanggal ke berbagai format. Kosongkan value untuk waktu sekarang.',
      parameters: [
        {
          name: 'value',
          in: 'query',
          required: false,
          description: 'Unix timestamp atau tanggal (ISO 8601 / string tanggal)',
          schema: { type: 'string', maxLength: 64 },
          example: '1731715200',
        },
      ],
      example: {
        unixSeconds: 1731715200,
        unixMilliseconds: 1731715200000,
        iso: '2024-11-16T00:00:00.000Z',
        utc: 'Sat, 16 Nov 2024 00:00:00 GMT',
        jakarta: 'Sabtu, 16 November 2024 pukul 07.00.00 WIB',
      },
      handler(req, res) {
        const d = parseTimestamp(req.query.value);
        success(
          res,
          {
            unixSeconds: Math.floor(d.getTime() / 1000),
            unixMilliseconds: d.getTime(),
            iso: d.toISOString(),
            utc: d.toUTCString(),
            jakarta: new Intl.DateTimeFormat('id-ID', {
              timeZone: 'Asia/Jakarta',
              dateStyle: 'full',
              timeStyle: 'long',
            }).format(d),
          },
          'Timestamp converted',
        );
      },
    },
    {
      method: 'get',
      path: '/random',
      summary: 'Random generator',
      description: 'Menghasilkan UUID v4, angka acak dalam rentang, atau string acak menggunakan crypto.',
      parameters: [
        { name: 'type', in: 'query', required: false, schema: { type: 'string', enum: ['uuid', 'number', 'string'], default: 'uuid' } },
        { name: 'min', in: 'query', required: false, description: 'Untuk type=number', schema: { type: 'integer', default: 0 } },
        { name: 'max', in: 'query', required: false, description: 'Untuk type=number', schema: { type: 'integer', default: 100 } },
        { name: 'length', in: 'query', required: false, description: 'Untuk type=string (1-256)', schema: { type: 'integer', default: 16 } },
      ],
      example: { type: 'uuid', result: '3b241101-e2bb-4255-8caf-4136c566a962' },
      handler(req, res) {
        const type = req.query.type ?? 'uuid';

        if (type === 'uuid') {
          return success(res, { type, result: crypto.randomUUID() }, 'Random UUID generated');
        }

        if (type === 'number') {
          const min = toInt(req.query.min, 0, 'min');
          const max = toInt(req.query.max, 100, 'max');
          if (min > max) throw new HttpError(400, 'Invalid request', '"min" must not be greater than "max"');
          if (max - min >= 2 ** 48) throw new HttpError(400, 'Invalid request', 'Range is too large');
          return success(res, { type, min, max, result: crypto.randomInt(min, max + 1) }, 'Random number generated');
        }

        if (type === 'string') {
          const length = toInt(req.query.length, 16, 'length');
          if (length < 1 || length > 256) throw new HttpError(400, 'Invalid request', '"length" must be between 1 and 256');
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
          let result = '';
          for (let i = 0; i < length; i++) result += chars[crypto.randomInt(chars.length)];
          return success(res, { type, length, result }, 'Random string generated');
        }

        throw new HttpError(400, 'Invalid request', 'Parameter "type" must be uuid, number, or string');
      },
    },
    {
      method: 'post',
      path: '/json',
      summary: 'Validate and format JSON',
      description: 'Memvalidasi JSON dan mengembalikannya dalam format rapi (pretty print).',
      requestBody: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', maxLength: MAX_TEXT },
          indent: { type: 'integer', minimum: 0, maximum: 8, default: 2 },
        },
      },
      requestExample: { text: '{"name":"RyharDev","tags":["api","open-source"]}', indent: 2 },
      example: { valid: true, formatted: '{\n  "name": "RyharDev",\n  "tags": [\n    "api",\n    "open-source"\n  ]\n}' },
      handler(req, res) {
        const text = requireString(req.body?.text, 'text', { max: MAX_TEXT });
        const indent = toInt(req.body?.indent, 2, 'indent');
        if (indent < 0 || indent > 8) throw new HttpError(400, 'Invalid request', '"indent" must be between 0 and 8');

        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new HttpError(400, 'Invalid request', 'Input is not valid JSON');
        }
        success(res, { valid: true, formatted: JSON.stringify(parsed, null, indent) }, 'JSON is valid');
      },
    },
    {
      method: 'get',
      path: '/ip',
      summary: 'IP information',
      description: 'Mengembalikan IP klien yang memanggil API beserta versinya.',
      example: { ip: '203.0.113.10', version: 'IPv4' },
      handler(req, res) {
        const ip = req.ip || 'unknown';
        const version = net.isIP(ip) === 6 ? 'IPv6' : net.isIP(ip) === 4 ? 'IPv4' : null;
        success(res, { ip, version }, 'IP information retrieved');
      },
    },
  ],
};
