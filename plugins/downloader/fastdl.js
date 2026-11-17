
// Instagram: Download posts, reels, carousels, and stories via FastDL API.
import { success, requireUrl, HttpError } from '../../src/response.js';
import { upstreamFetch } from '../../src/http.js';
import { webcrypto } from 'node:crypto';
import { createContext, runInContext } from 'node:vm';

const SUPPORTED_HOSTS = [
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
];

const FASTDL_BASE_URL = 'https://fastdl.app';
const FASTDL_API_URL = 'https://api-wh.fastdl.app';
const CAPTCHA_API_URL = 'https://cap.jhx.my.id/api';

const FASTDL_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Origin: FASTDL_BASE_URL,
  Referer: `${FASTDL_BASE_URL}/`,
};

const CAPTCHA_SITE_KEY = '0x4AAAAAABhLwGG2XCb7fE2M';
const DEFAULT_CHUNK_ID = 'd29415e56f2dc09c';

// ---------- helpers ----------

function normalizeInstagramInput(input) {
  const value = String(input || '').trim();

  if (!value) {
    throw new HttpError(
      400,
      'Bad request',
      'Masukkan URL Instagram atau username untuk mengambil Story.',
      'ValidationError',
    );
  }

  if (!/^https?:\/\//i.test(value)) {
    const username = value.replace(/^@/, '').split(/[/?#\s]/)[0];

    if (!/^[a-zA-Z0-9._]{1,30}$/.test(username)) {
      throw new HttpError(
        400,
        'Bad request',
        'Username Instagram tidak valid.',
        'ValidationError',
      );
    }

    return {
      url: `https://www.instagram.com/stories/${username}/`,
      isStory: true,
    };
  }

  const targetUrl = requireUrl(value, 'url', SUPPORTED_HOSTS);

  const url = new URL(targetUrl);
  const storyMatch = url.pathname.match(/^\/stories\/([^/]+)/);

  if (storyMatch) {
    return {
      url: `https://www.instagram.com/stories/${storyMatch[1]}/`,
      isStory: true,
    };
  }

  if (!/^\/(p|reel|reels|tv)\//.test(url.pathname)) {
    throw new HttpError(
      400,
      'Bad request',
      'URL harus berupa tautan Instagram Post, Reel, atau Story.',
      'ValidationError',
    );
  }

  return {
    url: targetUrl,
    isStory: false,
  };
}

async function fetchJson(url, options = {}) {
  const response = await upstreamFetch(url, {
    timeout: 20_000,
    ...options,
  });

  if (!response.ok) {
    throw new HttpError(
      502,
      'Upstream error',
      `Server upstream merespons dengan status HTTP ${response.status}.`,
      'UpstreamError',
    );
  }

  try {
    return await response.json();
  } catch {
    throw new HttpError(
      502,
      'Upstream error',
      'Format respons JSON dari server upstream tidak valid.',
      'UpstreamError',
    );
  }
}

async function resolveCaptchaToken() {
  const task = await fetchJson(`${CAPTCHA_API_URL}/createTask`, {
    method: 'POST',
    headers: {
      ...FASTDL_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: `${FASTDL_BASE_URL}/`,
      type: 'turnstile-min',
      sitekey: CAPTCHA_SITE_KEY,
    }),
  });

  if (!task.success || !task.jobId) {
    throw new HttpError(
      502,
      'Captcha error',
      'Gagal membuat tugas verifikasi keamanan.',
      'CaptchaError',
    );
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await fetchJson(`${CAPTCHA_API_URL}/getResult`, {
      method: 'POST',
      headers: {
        ...FASTDL_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: task.jobId,
      }),
    });

    if (result.status === 'ready' && result.solution?.token) {
      return result.solution.token;
    }

    if (result.status === 'failed') {
      break;
    }
  }

  throw new HttpError(
    502,
    'Captcha error',
    'Verifikasi keamanan gagal atau melewati batas waktu.',
    'CaptchaError',
  );
}

async function exchangeCaptchaToken(captchaToken) {
  const formData = new URLSearchParams({
    cfToken: captchaToken,
  });

  const response = await fetchJson(`${FASTDL_API_URL}/api/cf`, {
    method: 'POST',
    headers: {
      ...FASTDL_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.result) {
    throw new HttpError(
      502,
      'Captcha error',
      'Gagal memproses token verifikasi keamanan.',
      'CaptchaError',
    );
  }

  return response.result;
}

async function getSignatureFunction() {
  let chunkId = DEFAULT_CHUNK_ID;

  try {
    const mainHtml = await upstreamFetch(`${FASTDL_BASE_URL}/`, {
      headers: FASTDL_HEADERS,
      timeout: 15_000,
    });

    if (mainHtml.ok) {
      const html = await mainHtml.text();
      const appId = html.match(/\/js\/app\.js\?id=([a-zA-Z0-9]+)/)?.[1];

      if (appId) {
        const appResponse = await upstreamFetch(
          `${FASTDL_BASE_URL}/js/app.js?id=${appId}`,
          {
            headers: FASTDL_HEADERS,
            timeout: 15_000,
          },
        );

        if (appResponse.ok) {
          const appCode = await appResponse.text();

          chunkId =
            appCode.match(/54:\s*"([a-zA-Z0-9]+)"/)?.[1] ||
            chunkId;
        }
      }
    }
  } catch {
    // Gunakan chunk ID default apabila gagal mengambil konfigurasi terbaru.
  }

  const chunkResponse = await upstreamFetch(
    `${FASTDL_BASE_URL}/js/link.chunk.js?ch=${chunkId}`,
    {
      headers: FASTDL_HEADERS,
      timeout: 20_000,
    },
  );

  if (!chunkResponse.ok) {
    throw new HttpError(
      502,
      'Upstream error',
      'Gagal mengambil modul pemrosesan FastDL.',
      'UpstreamError',
    );
  }

  const chunkCode = await chunkResponse.text();

  const context = {
    crypto: webcrypto,
    fetch: async () => ({
      json: async () => ({
        msec: Date.now() / 1000,
      }),
    }),
    atob,
    btoa,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    Array,
    String,
    Number,
    RegExp,
    Set,
    Error,
    TypeError,
    Promise,
    isNaN,
    parseInt,
    Date,
    Math,
    JSON,
    Symbol,
    Object,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    webpackChunk: [],
  };

  context.window = context;
  context.self = context;
  context.globalThis = context;
  context.top = context;
  context.document = context;
  context.location = context;
  context.navigator = context;

  context.href = `${FASTDL_BASE_URL}/`;
  context.hostname = 'fastdl.app';
  context.userAgent = FASTDL_HEADERS['User-Agent'];

  createContext(context);
  runInContext(chunkCode, context);

  const webpackModules = context.webpackChunk?.[0]?.[1];

  if (!webpackModules) {
    throw new HttpError(
      502,
      'Upstream error',
      'Gagal memuat modul Webpack FastDL.',
      'UpstreamError',
    );
  }

  const moduleCache = {};

  const requireModule = id => {
    if (moduleCache[id]) {
      return moduleCache[id].exports;
    }

    const module = {
      exports: {},
    };

    moduleCache[id] = module;
    webpackModules[id](module, module.exports, requireModule);

    return module.exports;
  };

  requireModule.d = (exports, definitions) => {
    Object.keys(definitions).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(exports, key)) {
        Object.defineProperty(exports, key, {
          enumerable: true,
          get: definitions[key],
        });
      }
    });
  };

  requireModule.r = exports => {
    Object.defineProperty(exports, Symbol.toStringTag, {
      value: 'Module',
    });

    Object.defineProperty(exports, '__esModule', {
      value: true,
    });
  };

  const signatureModule = requireModule(7027);

  return signatureModule.default || signatureModule;
}

function extractInstagramMedia(items, isStory) {
  const media = [];

  for (const item of items) {
    if (isStory) {
      const videos = item.video_versions || [];
      const images = item.image_versions2?.candidates || [];

      if (videos.length) {
        media.push({
          type: 'video',
          url: videos[0].url_wrapped || videos[0].url,
        });
      } else if (images.length) {
        media.push({
          type: 'image',
          url: images[0].url_wrapped || images[0].url,
        });
      }

      continue;
    }

    const assets = Array.isArray(item.url) ? item.url : [];

    for (const asset of assets) {
      if (!asset.url) continue;

      media.push({
        type:
          asset.type === 'mp4' || asset.ext === 'mp4'
            ? 'video'
            : 'image',
        url: asset.url,
      });
    }
  }

  return media.filter(item => item.url);
}

// ---------- plugin ----------

export default {
  name: 'fastdl',
  description:
    'Mengunduh media Instagram berupa foto, video, carousel, Reel, dan Story melalui layanan FastDL.',
  version: '1.0.0',
  author: 'RyharDev',

  routes: [
    {
      method: 'get',
      path: '/instagram',
      summary: 'Download Instagram media',
      description:
        'Mengambil informasi dan tautan media dari Instagram Post, Reel, Carousel, atau Story publik. Untuk Story, parameter dapat diisi dengan username Instagram.',

      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description:
            'URL Instagram atau username untuk mengambil Story.',
          schema: {
            type: 'string',
            maxLength: 2048,
          },
          examples: {
            post: {
              value: 'https://www.instagram.com/p/DZcugj-ICJF/',
            },
            reel: {
              value: 'https://www.instagram.com/reel/example/',
            },
            story: {
              value: 'JKT48.FIONY',
            },
          },
        },
      ],

      example: {
        author: 'instagram_user',
        caption: 'Contoh keterangan media Instagram',
        media: [
          {
            type: 'image',
            url: 'https://example.com/image.jpg',
          },
          {
            type: 'video',
            url: 'https://example.com/video.mp4',
          },
        ],
      },

      async handler(req, res) {
        const { url: targetUrl, isStory } = normalizeInstagramInput(
          req.query.url,
        );

        const apiEndpoint = isStory
          ? `${FASTDL_API_URL}/api/v1/instagram/story`
          : `${FASTDL_API_URL}/api/convert`;

        const generateSignature = await getSignatureFunction();

        const requestPayload = await generateSignature(
          isStory
            ? { url: targetUrl }
            : { target_url: targetUrl },
        );

        let captchaToken = await resolveCaptchaToken();
        let verificationToken = await exchangeCaptchaToken(captchaToken);

        const fetchMedia = () =>
          upstreamFetch(apiEndpoint, {
            method: 'POST',
            headers: {
              ...FASTDL_HEADERS,
              'Content-Type': 'application/json',
              'wh-cf-token': verificationToken,
            },
            body: JSON.stringify(requestPayload),
            timeout: 30_000,
          });

        let apiResponse = await fetchMedia();

        if (
          apiResponse.status === 422 ||
          apiResponse.status === 403
        ) {
          captchaToken = await resolveCaptchaToken();
          verificationToken = await exchangeCaptchaToken(captchaToken);

          apiResponse = await fetchMedia();
        }

        if (!apiResponse.ok) {
          throw new HttpError(
            502,
            'Upstream error',
            `Layanan Instagram downloader merespons dengan status HTTP ${apiResponse.status}.`,
            'UpstreamError',
          );
        }

        let responsePayload;

        try {
          responsePayload = await apiResponse.json();
        } catch {
          throw new HttpError(
            502,
            'Upstream error',
            'Format respons dari layanan Instagram downloader tidak valid.',
            'UpstreamError',
          );
        }

        const mediaItems = isStory
          ? responsePayload?.result
          : responsePayload;

        if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
          throw new HttpError(
            404,
            'Not found',
            responsePayload?.message ||
              'Media tidak ditemukan atau tidak dapat diakses.',
            'NotFoundError',
          );
        }

        const firstItem = mediaItems[0];

        const author = isStory
          ? firstItem.user?.username || null
          : firstItem.meta?.username || null;

        const caption = isStory
          ? null
          : firstItem.meta?.title || null;

        const media = extractInstagramMedia(mediaItems, isStory);

        if (!media.length) {
          throw new HttpError(
            404,
            'Not found',
            'Tidak ditemukan tautan media yang dapat diunduh.',
            'NotFoundError',
          );
        }

        success(
          res,
          {
            author,
            caption,
            media,
          },
          'Media Instagram berhasil diambil.',
        );
      },
    },
  ],
};
