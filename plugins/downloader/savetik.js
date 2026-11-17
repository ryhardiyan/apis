// SaveTik: download Douyin & TikTok video (HD/SD) and audio via SaveTik API (/savetik).
import { success, requireUrl, HttpError } from '../../src/response.js';
import { upstreamFetch } from '../../src/http.js';

const SUPPORTED_HOSTS = [
  'douyin.com',
  'www.douyin.com',
  'v.douyin.com',
  'iesdouyin.com',
  'www.iesdouyin.com',
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
];

const SAVETIK_API_ENDPOINT = 'https://savetik.co/api/ajaxSearch';
const SAVETIK_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Accept: '*/*',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 13; 23021RAA2Y Build/TKQ1.221114.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.36 Mobile Safari/537.36',
  Referer: 'https://savetik.co/id/douyin-downloader',
};

// ---------- helpers ----------

function decodeHtmlEntities(rawText) {
  if (!rawText) return rawText;
  return rawText
    .replace(/&#x([0-9A-Fa-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function extractFirstGroup(htmlContent, pattern) {
  const match = htmlContent.match(pattern);
  return match?.[1] ?? null;
}

function parseSaveTikHtml(htmlContent) {
  const hdVideoUrl = extractFirstGroup(htmlContent, /href="([^"]+)"[^>]*>.*?Unduh MP4 HD/is);
  const sdVideoUrl = extractFirstGroup(htmlContent, /href="([^"]+)"[^>]*>.*?Unduh MP4 \[1\]/is);
  const audioUrl = extractFirstGroup(htmlContent, /href="([^"]+)"[^>]*>.*?Unduh MP3/is);
  const rawCaption = extractFirstGroup(htmlContent, /<h3>(.*?)<\/h3>/is)?.trim() ?? null;
  const duration = extractFirstGroup(htmlContent, /<p>(\d+:\d+)<\/p>/is)?.trim() ?? null;
  const rawCoverUrl = extractFirstGroup(htmlContent, /<img src="([^"]+)"/is);

  if (!hdVideoUrl && !sdVideoUrl && !audioUrl) {
    throw new HttpError(404, 'Not found', 'Media tidak ditemukan pada tautan tersebut atau video bersifat privat.', 'NotFoundError');
  }

  return {
    caption: decodeHtmlEntities(rawCaption) || 'Tanpa Keterangan',
    duration,
    cover: rawCoverUrl ? rawCoverUrl.replace(/&amp;/g, '&') : null,
    video_hd: hdVideoUrl,
    video_sd: sdVideoUrl,
    video: hdVideoUrl || sdVideoUrl,
    audio: audioUrl,
  };
}

// ---------- plugin ----------

export default {
  name: 'savetik',
  description: 'Mengunduh video Douyin dan TikTok (kualitas HD/SD) serta audio MP3 melalui layanan SaveTik.',
  version: '1.0.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'get',
      path: '/savetik',
      summary: 'Download Douyin or TikTok media via SaveTik',
      description: 'Mengambil tautan unduhan video (HD/SD) dan audio MP3 dari URL Douyin atau TikTok publik.',
      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description: 'URL video Douyin atau TikTok',
          schema: { type: 'string', format: 'uri', maxLength: 2048 },
          example: 'https://v.douyin.com/example/',
        },
      ],
      example: {
        caption: 'Contoh keterangan video',
        duration: '00:15',
        cover: 'https://p16-sign.douyinpic.com/cover.jpeg',
        video_hd: 'https://dl.snapcdn.app/get?token=hd_example',
        video_sd: 'https://dl.snapcdn.app/get?token=sd_example',
        video: 'https://dl.snapcdn.app/get?token=hd_example',
        audio: 'https://dl.snapcdn.app/get?token=mp3_example',
      },
      async handler(req, res) {
        const targetUrl = requireUrl(req.query.url, 'url', SUPPORTED_HOSTS);
        const formPayload = new URLSearchParams({
          q: targetUrl,
          lang: 'id',
          cftoken: '',
        });

        const upstreamResponse = await upstreamFetch(SAVETIK_API_ENDPOINT, {
          method: 'POST',
          headers: SAVETIK_HEADERS,
          body: formPayload.toString(),
          timeout: 15_000,
        });

        if (upstreamResponse.status === 403) {
          throw new HttpError(
            502,
            'Upstream error',
            'Permintaan diblokir oleh proteksi keamanan (HTTP 403) pada server upstream.',
            'UpstreamBlockedError',
          );
        }

        if (!upstreamResponse.ok) {
          throw new HttpError(
            502,
            'Upstream error',
            `Server upstream merespons dengan status HTTP ${upstreamResponse.status}.`,
            'UpstreamError',
          );
        }

        let responsePayload;
        try {
          responsePayload = await upstreamResponse.json();
        } catch {
          throw new HttpError(502, 'Upstream error', 'Format respons JSON dari server upstream tidak valid.', 'UpstreamError');
        }

        if (responsePayload?.status !== 'ok' || !responsePayload?.data) {
          throw new HttpError(
            422,
            'Unprocessable entity',
            responsePayload?.mess || 'Tautan tidak dapat diproses oleh layanan pengunduh.',
            'ProcessingError',
          );
        }

        const mediaData = parseSaveTikHtml(responsePayload.data);
        success(res, mediaData, 'Tautan media berhasil diambil');
      },
    },
  ],
};
