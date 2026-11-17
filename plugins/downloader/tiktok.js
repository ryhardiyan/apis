// TikTok: media links (/download) reading embedded page data and the TikTok player API.
import { success, requireUrl, HttpError } from '../../src/response.js';
import { upstreamFetch } from '../../src/http.js';

const TIKTOK_HOSTS = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'];
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// ---------- helpers ----------

async function resolveShortLink(url) {
  if (!/^(vm|vt)\.tiktok\.com$/.test(new URL(url).hostname)) return url;
  const res = await upstreamFetch(url, { redirect: 'manual', headers: { 'User-Agent': ANDROID_UA } });
  const location = res.headers.get('location');
  if (!location) return url;
  // Validate the redirect target again so a short link cannot send us to another host.
  return requireUrl(new URL(location, url).toString(), 'redirect', TIKTOK_HOSTS);
}

function extractJsonScript(html, id) {
  const m = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`));
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function extractItem(html) {
  const api = extractJsonScript(html, 'api-data');
  const direct = api?.videoDetail?.itemInfo?.itemStruct || api?.itemInfo?.itemStruct;
  if (direct) return direct;

  const scope = extractJsonScript(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__')?.__DEFAULT_SCOPE__ || {};
  for (const key of Object.keys(scope)) {
    const item = scope[key]?.itemInfo?.itemStruct || scope[key]?.videoDetail?.itemInfo?.itemStruct;
    if (item) return item;
  }
  return null;
}

async function fetchItem(url, userAgent) {
  const res = await upstreamFetch(url, {
    headers: { 'User-Agent': userAgent, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' },
  });
  if (!res.ok) throw new HttpError(502, 'Upstream error', `TikTok responded with HTTP ${res.status}`, 'UpstreamError');

  const item = extractItem(await res.text());
  if (!item) {
    throw new HttpError(404, 'Not found', 'Video not found, or TikTok is rate-limiting requests. Try again later', 'NotFoundError');
  }
  return item;
}

const pickUrl = (addr) => {
  if (typeof addr === 'string') return addr;
  if (Array.isArray(addr) && addr.length) return addr[addr.length - 1]?.url ?? null;
  return null;
};
const firstUrl = (v) => (typeof v === 'string' ? v : v?.urlList?.[0] ?? null);
const imageUrls = (item) => (item.imagePost?.images || []).flatMap((img) => img?.imageURL?.urlList || []);

function shape(item, media) {
  return {
    id: String(item.id || ''),
    isVideo: !item.imagePost,
    title: item.desc || '',
    author: {
      username: item.author?.uniqueId || '',
      nickname: item.author?.nickname || '',
      verified: !!item.author?.verified,
      avatar: firstUrl(item.author?.avatarLarger) || firstUrl(item.author?.avatarThumb),
    },
    stats: {
      plays: item.stats?.playCount || 0,
      likes: item.stats?.diggCount || 0,
      comments: item.stats?.commentCount || 0,
      shares: item.stats?.shareCount || 0,
      saves: item.stats?.collectCount || 0,
    },
    duration: item.video?.duration || 0,
    cover: firstUrl(item.video?.cover) || firstUrl(item.video?.originCover),
    music: { title: item.music?.title || '', author: item.music?.authorName || '', url: item.music?.playUrl || null },
    media: media.filter(Boolean).filter((u, i, arr) => arr.indexOf(u) === i),
  };
}

async function fetchMedia(url) {
  const item = await fetchItem(url, ANDROID_UA);
  if (item.imagePost) return shape(item, imageUrls(item));

  const media = [pickUrl(item.video?.downloadAddr), pickUrl(item.video?.playAddr)];
  if (item.id) {
    try {
      const res = await upstreamFetch(`https://www.tiktok.com/player/api/v1/items?item_ids=${item.id}`, { timeout: 5000 });
      const direct = (await res.json())?.items?.[0]?.video_info?.url_list?.[0];
      if (direct) media.unshift(direct);
    } catch {
      // The player API is optional; keep the page-based links.
    }
  }
  return shape(item, media);
}

// ---------- plugin ----------

export default {
  name: 'tiktok',
  description: 'Link download video tanpa watermark atau slide gambar TikTok.',
  version: '1.1.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'get',
      path: '/download',
      summary: 'Get TikTok media links',
      description: 'Link video tanpa watermark (jika tersedia) atau daftar URL gambar untuk slide post.',
      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description: 'URL video atau slide TikTok (termasuk vm/vt.tiktok.com)',
          schema: { type: 'string', format: 'uri', maxLength: 2048 },
          example: 'https://vt.tiktok.com/ZSVFvdSTn/',
        },
      ],
      example: {
        id: '6718335390845095173',
        isVideo: true,
        title: 'Contoh judul video',
        author: { username: 'scout2015', nickname: 'Scout', verified: false, avatar: null },
        stats: { plays: 1000, likes: 100, comments: 10, shares: 5, saves: 2 },
        duration: 15,
        cover: 'https://p16-sign.tiktokcdn.com/example.jpeg',
        music: { title: 'original sound', author: 'scout2015', url: null },
        media: ['https://v16-webapp.tiktok.com/example.mp4'],
      },
      async handler(req, res) {
        const target = await resolveShortLink(requireUrl(req.query.url, 'url', TIKTOK_HOSTS));
        const data = await fetchMedia(target);
        success(res, data, 'Media links retrieved');
      },
    },
  ],
};
