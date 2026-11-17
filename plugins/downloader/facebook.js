// Facebook video downloader with two server variants (srv=1 | srv=2).
// srv=1: native stream parser (HD/SD from embedded page data, og:video fallback).
// srv=2: meta-tag and script parser (og:video, hd_src/sd_src, mp4 fallback).
import { success, requireUrl, HttpError } from '../../src/response.js';
import { upstreamFetch } from '../../src/http.js';

const FB_HOSTS = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch'];
const PAGE_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

// ---------- helpers ----------

const first = (html, patterns) => {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
};

// Both attribute orders that Facebook uses for <meta property=... content=...>
const metaPatterns = (name) => [
  new RegExp(`<meta\\s+property="${name}"\\s+content="([^"]+)"`, 'i'),
  new RegExp(`<meta\\s+content="([^"]+)"\\s+property="${name}"`, 'i'),
];

const decodeFbUrl = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw.replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  }
};

const decodeHtml = (s) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

const normalizeFacebookUrl = (url) => {
  const m = url.match(/(?:facebook\.com|fb\.watch)\/reel\/(\d+)/i);
  return m ? `https://www.facebook.com/watch/?v=${m[1]}` : url;
};

async function loadPage(url) {
  const res = await upstreamFetch(url, { headers: PAGE_HEADERS, timeout: 9000 });
  if (!res.ok) throw new HttpError(502, 'Upstream error', `Facebook responded with HTTP ${res.status}`, 'UpstreamError');
  return res.text();
}

// ---------- server variants: return { hd, sd } ----------

function extractSrv1(html) {
  const hd = first(html, [
    /"browser_native_hd_url":"([^"]+)"/,
    /"playable_url_quality_hd":"([^"]+)"/,
    /"hd_src":"([^"]+)"/,
    /"hd_src_no_ratelimit":"([^"]+)"/,
  ]);
  const sd = first(html, [
    /"browser_native_sd_url":"([^"]+)"/,
    /"playable_url":"([^"]+)"/,
    /"sd_src":"([^"]+)"/,
    /"sd_src_no_ratelimit":"([^"]+)"/,
  ]);
  let hdUrl = decodeFbUrl(hd);
  let sdUrl = decodeFbUrl(sd);
  if (!hdUrl && !sdUrl) sdUrl = decodeFbUrl(first(html, metaPatterns('og:video')));
  return { hd: hdUrl, sd: sdUrl };
}

function extractSrv2(html) {
  const ogVideo = first(html, metaPatterns('og:video:secure_url').concat(metaPatterns('og:video')));
  let hd = ogVideo ? decodeHtml(ogVideo) : null;
  let sd = null;

  const hdScript = first(html, [/"hd_src":"([^"]+)"/, /"hd_src_no_rtt":"([^"]+)"/]);
  const sdScript = first(html, [/"sd_src":"([^"]+)"/, /"sd_src_no_rtt":"([^"]+)"/]);
  if (hdScript) hd = hdScript.replace(/\\u0026/g, '&');
  if (sdScript) sd = sdScript.replace(/\\u0026/g, '&');

  if (!hd && !sd) hd = first(html, [/"(https?:\/\/[^"]+\.mp4[^"]*)"/i]);
  return { hd, sd };
}

// ---------- result ----------

function buildResult(html, { hd, sd }) {
  if (!hd && !sd) {
    throw new HttpError(404, 'Not found', 'Video stream not found. Make sure the video is public and the link is still active', 'NotFoundError');
  }

  const rawTitle = first(html, [...metaPatterns('og:title'), /<title>([^<]+)<\/title>/i]) || 'Facebook Video';
  const title = decodeHtml(rawTitle.replace(/ \| Facebook$/i, '').trim()).slice(0, 200);
  const thumbnail = first(html, [...metaPatterns('og:image'), /"preferred_thumbnail":\{"image":\{"uri":"([^"]+)"/i]);
  const durationMs = first(html, [/"playable_duration_in_ms":(\d+)/]);

  const medias = [];
  if (hd) medias.push({ quality: 'HD', url: hd });
  if (sd) medias.push({ quality: 'SD', url: sd });

  return {
    title,
    duration: durationMs ? Math.round(Number(durationMs) / 1000) : null,
    thumbnail: thumbnail ? decodeFbUrl(thumbnail) : null,
    video: hd || sd,
    medias,
  };
}

// ---------- plugin ----------

export default {
  name: 'facebook',
  description: 'Downloader video dan reels Facebook (HD/SD) dengan dua server (srv=1, srv=2).',
  version: '1.0.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'get',
      path: '/download',
      summary: 'Get Facebook video links',
      description: 'Mengambil metadata dan link video (HD/SD) dari video atau reels Facebook publik.',
      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description: 'URL video atau reels Facebook publik',
          schema: { type: 'string', format: 'uri', maxLength: 2048 },
          example: 'https://www.facebook.com/watch/?v=10153231379946729',
        },
        {
          name: 'srv',
          in: 'query',
          required: false,
          description: 'Server yang dipakai: 1 atau 2',
          schema: { type: 'string', enum: ['1', '2'], default: '1' },
        },
      ],
      example: {
        server: 'srv1',
        title: 'Contoh video Facebook',
        duration: 30,
        thumbnail: 'https://scontent.xx.fbcdn.net/example.jpg',
        video: 'https://video.xx.fbcdn.net/example.mp4',
        medias: [{ quality: 'HD', url: 'https://video.xx.fbcdn.net/example.mp4' }],
      },
      async handler(req, res) {
        const srv = req.query.srv ?? '1';
        if (!['1', '2'].includes(srv)) throw new HttpError(400, 'Invalid request', 'Parameter "srv" must be 1 or 2');

        const target = normalizeFacebookUrl(requireUrl(req.query.url, 'url', FB_HOSTS));
        const html = await loadPage(target);
        const streams = srv === '2' ? extractSrv2(html) : extractSrv1(html);
        success(res, { server: `srv${srv}`, ...buildResult(html, streams) }, 'Video info retrieved');
      },
    },
  ],
};
