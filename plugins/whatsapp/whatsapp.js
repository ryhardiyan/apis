// WhatsApp helper tools: build wa.me links with normalized phone numbers.
// Persistent WhatsApp Web sessions are NOT supported here (not compatible with serverless).
import { success, requireString, HttpError } from '../../src/response.js';
import { CONFIG } from '../../src/config.js';

function normalizePhone(raw) {
  let digits = requireString(raw, 'phone', { max: 30 }).replace(/[\s\-().+]/g, '');
  if (!/^\d+$/.test(digits)) {
    throw new HttpError(400, 'Invalid request', 'Parameter "phone" must contain digits only');
  }
  if (digits.startsWith('0')) digits = CONFIG.defaultCountryCode + digits.slice(1);
  if (digits.length < 8 || digits.length > 15) {
    throw new HttpError(400, 'Invalid request', 'Parameter "phone" must be 8-15 digits including country code');
  }
  return digits;
}

function buildLink(input) {
  const phone = normalizePhone(input?.phone);
  const text = requireString(input?.text, 'text', { max: 1000, required: false });
  const url = new URL(`https://wa.me/${phone}`);
  if (text) url.searchParams.set('text', text);
  return { phone, link: url.toString() };
}

const phoneParam = { name: 'phone', required: true, description: 'Nomor tujuan', schema: { type: 'string' }, example: '081234567890' };
const textParam = { name: 'text', required: false, description: 'Pesan awal (maks 1000 karakter)', schema: { type: 'string' }, example: 'Halo!' };

export default {
  name: 'whatsapp',
  description: 'Tools pendukung bot WhatsApp: normalisasi nomor dan pembuatan link wa.me.',
  version: '1.0.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'get',
      path: '/link',
      summary: 'Create wa.me link (GET)',
      parameters: [
        { ...phoneParam, in: 'query' },
        { ...textParam, in: 'query' },
      ],
      example: { phone: '6281234567890', link: 'https://wa.me/6281234567890?text=Halo%21' },
      handler(req, res) {
        success(res, buildLink(req.query), 'WhatsApp link generated');
      },
    },
    {
      method: 'post',
      path: '/link',
      summary: 'Create wa.me link (POST)',
      requestBody: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', example: '081234567890' },
          text: { type: 'string', maxLength: 1000, example: 'Halo!' },
        },
      },
      requestExample: { phone: '081234567890', text: 'Halo!' },
      example: { phone: '6281234567890', link: 'https://wa.me/6281234567890?text=Halo%21' },
      handler(req, res) {
        success(res, buildLink(req.body ?? {}), 'WhatsApp link generated');
      },
    },
  ],
};
