// AMFinder: extract Alight Motion preset links (5MB & XML) from TikTok videos via SSE stream (/amfinder).
import { success, HttpError } from '../../src/response.js';
import { upstreamFetch } from '../../src/http.js';

const AMFINDER_BASE_URL = 'https://amfinder.web.id';
const TIKTOK_URL_OR_ID_REGEX = /(?:tiktok\.com|^\d{15,}$)/i;
const STREAM_TIMEOUT_MS = 60_000;

// ---------- helpers ----------

function validateTikTokInput(rawInput) {
  const cleaned = String(rawInput || '').trim();
  if (!cleaned) {
    throw new HttpError(400, 'Invalid request', 'Parameter "url" wajib diisi.', 'BadRequestError');
  }
  if (!TIKTOK_URL_OR_ID_REGEX.test(cleaned)) {
    throw new HttpError(
      400,
      'Invalid request',
      'Input harus berupa URL video TikTok yang valid atau ID video numerik.',
      'BadRequestError',
    );
  }
  return cleaned;
}

async function parseEventStreamResult(response) {
  if (!response.body) {
    throw new HttpError(502, 'Upstream error', 'Server upstream tidak mengembalikan stream data.', 'UpstreamError');
  }

  const streamReader = response.body.getReader();
  const textDecoder = new TextDecoder();
  let streamBuffer = '';
  let activeEvent = null;

  while (true) {
    const { done, value } = await streamReader.read();
    if (done) break;

    streamBuffer += textDecoder.decode(value, { stream: true });
    const lines = streamBuffer.split('\n');
    streamBuffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        activeEvent = null;
        continue;
      }

      if (line.startsWith('event:')) {
        activeEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const payloadText = line.slice(5).trim();

        if (activeEvent === 'result') {
          try {
            return JSON.parse(payloadText);
          } catch {
            throw new HttpError(502, 'Upstream error', 'Format data hasil dari server tidak dapat dibaca.', 'UpstreamError');
          }
        }

        if (activeEvent === 'error') {
          let errorMessage = 'Terjadi kesalahan saat memproses permintaan di server upstream.';
          try {
            const parsedError = JSON.parse(payloadText);
            if (parsedError?.message) errorMessage = parsedError.message;
          } catch {
            // Keep default message if payload is not valid JSON.
          }
          throw new HttpError(502, 'Upstream error', errorMessage, 'UpstreamError');
        }
      }
    }
  }

  throw new HttpError(504, 'Gateway timeout', 'Koneksi stream terputus sebelum hasil diterima.', 'TimeoutError');
}

function normalizePresetResponse(rawPayload) {
  const videoMeta = rawPayload.video || {};
  const videoStats = videoMeta.stats || {};
  const rawPresets = Array.isArray(rawPayload.presetLinks) ? rawPayload.presetLinks : [];

  return {
    author: rawPayload.author || null,
    avatar: rawPayload.authorDetail?.avatar || null,
    video: {
      description: videoMeta.description?.trim() || '',
      cover: videoMeta.cover || null,
      play_url: videoMeta.playUrlNoWm || videoMeta.playUrl || null,
      width: videoMeta.width ?? null,
      height: videoMeta.height ?? null,
      stats: {
        views: videoStats.views ?? null,
        likes: videoStats.likes ?? null,
        comments: videoStats.comments ?? null,
      },
    },
    total_presets: rawPresets.length,
    presets: rawPresets.map((item) => ({
      title: item.title || (item.type === '5mb' ? 'Preset 5MB' : 'File XML'),
      url: item.url,
      type: item.type || null,
      size: item.size || null,
      ratio: item.ratio || null,
      thumbnail: item.thumb || null,
      is_pinned: Boolean(item.pinned),
      is_by_author: Boolean(item.byAuthor),
      detail: item.detail || null,
    })),
  };
}

// ---------- plugin ----------

export default {
  name: 'amfinder',
  description: 'Mencari tautan preset Alight Motion (5MB dan XML) dari tautan atau ID video TikTok.',
  version: '1.0.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'get',
      path: '/amfinder',
      summary: 'Find Alight Motion presets from TikTok video',
      description: 'Mengambil informasi video TikTok beserta daftar tautan preset Alight Motion yang terdeteksi.',
      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description: 'URL video TikTok (mis. https://vt.tiktok.com/xxx) atau ID video numerik',
          schema: { type: 'string', maxLength: 2048 },
          example: 'https://vt.tiktok.com/ZSbmR9kCu/',
        },
      ],
      example: {
        author: 'creator_username',
        avatar: 'https://p16-sign.tiktokcdn.com/avatar.jpeg',
        video: {
          description: 'Contoh deskripsi video preset',
          cover: 'https://p16-sign.tiktokcdn.com/cover.jpeg',
          play_url: 'https://v16-webapp.tiktok.com/video.mp4',
          width: 1080,
          height: 1920,
          stats: { views: 15000, likes: 1200, comments: 45 },
        },
        total_presets: 1,
        presets: [
          {
            title: 'Preset 5MB',
            url: 'https://alight.link/example',
            type: '5mb',
            size: '2.4 MB',
            ratio: '9:16',
            thumbnail: null,
            is_pinned: true,
            is_by_author: true,
            detail: null,
          },
        ],
      },
      async handler(req, res) {
        const targetInput = validateTikTokInput(req.query.url);
        const endpointUrl = `${AMFINDER_BASE_URL}/api/find?url=${encodeURIComponent(targetInput)}`;

        const upstreamResponse = await upstreamFetch(endpointUrl, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
            'User-Agent': 'Mozilla/5.0 (compatible; RyharDevAPI/1.0)',
          },
          timeout: STREAM_TIMEOUT_MS,
        });

        if (!upstreamResponse.ok) {
          throw new HttpError(
            502,
            'Upstream error',
            `Server upstream merespons dengan status HTTP ${upstreamResponse.status}.`,
            'UpstreamError',
          );
        }

        const contentType = upstreamResponse.headers.get('content-type') || '';
        if (!contentType.includes('text/event-stream')) {
          throw new HttpError(502, 'Upstream error', 'Format respons server tidak sesuai dengan stream yang diharapkan.', 'UpstreamError');
        }

        const streamPayload = await parseEventStreamResult(upstreamResponse);
        if (streamPayload.ok === false) {
          throw new HttpError(
            422,
            'Unprocessable entity',
            streamPayload.error || 'Tautan video tidak dapat diproses oleh layanan pencari preset.',
            'ProcessingError',
          );
        }

        const formattedData = normalizePresetResponse(streamPayload);
        success(res, formattedData, 'Data preset Alight Motion berhasil diambil');
      },
    },
  ],
};
