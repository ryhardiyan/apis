// TikTok Preset Finder: extract Alight Motion preset links from TikTok comments (/preset).
import { success, requireUrl, HttpError } from '../../src/response.js';
import { upstreamFetch } from '../../src/http.js';

const TIKTOK_HOSTS = ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'];
const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const BASE_HEADERS = {
  'User-Agent': MOBILE_UA,
  Accept: 'application/json, text/plain, text/html, */*',
  Referer: 'https://www.tiktok.com/',
};

const PRESET_LINK_REGEX = /https?:\/\/(www\.)?(alightcreative\.com\/am\/share\/|alight\.link\/)[^\s'"><]+/gi;
const ANY_URL_REGEX = /https?:\/\/[^\s'"><]+/gi;

// ---------- helpers ----------

function formatNumber(num) {
  return Number(num || 0).toLocaleString('id-ID');
}

function formatTimestamp(unixSeconds) {
  if (!unixSeconds) return '-';
  const formatted = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(unixSeconds * 1000));
  return `${formatted} WIB`;
}

async function resolveShortLink(url) {
  if (!/^(vm|vt)\.tiktok\.com$|\/t\//i.test(url)) return url;
  const res = await upstreamFetch(url, { redirect: 'manual', headers: BASE_HEADERS });
  const location = res.headers.get('location');
  if (!location) return url;
  return requireUrl(new URL(location, url).toString(), 'redirect', TIKTOK_HOSTS);
}

function extractVideoId(url) {
  const match = url.match(/(?:video|photo|v)\/(\d+)/i) || url.match(/(\d{15,22})/);
  return match?.[1] ?? null;
}

async function fetchVideoMetadata(videoId) {
  const fallback = { id: videoId };
  try {
    const res = await upstreamFetch(`https://m.tiktok.com/v/${videoId}.html`, { headers: BASE_HEADERS });
    if (!res.ok) return fallback;

    const html = await res.text();
    const scriptMatch = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) return fallback;

    const scope = JSON.parse(scriptMatch[1])?.__DEFAULT_SCOPE__ || {};
    const item =
      scope['webapp.video-detail']?.itemInfo?.itemStruct || scope['webapp.reflow.video.detail']?.itemInfo?.itemStruct;

    if (!item) return fallback;

    return {
      id: item.id || videoId,
      desc: item.desc || '',
      author: {
        username: item.author?.uniqueId || '',
        nickname: item.author?.nickname || '',
        verified: Boolean(item.author?.verified),
      },
      stats: {
        likes: item.stats?.diggCount ?? 0,
        comments: item.stats?.commentCount ?? 0,
        shares: item.stats?.shareCount ?? 0,
        views: item.stats?.playCount ?? 0,
      },
    };
  } catch {
    return fallback;
  }
}

function extractPresetLinks(text) {
  const content = text || '';
  const presetLinks = content.match(PRESET_LINK_REGEX) || [];
  const otherLinks = (content.match(ANY_URL_REGEX) || []).filter((link) => !presetLinks.includes(link));
  return { presetLinks, otherLinks };
}

async function scanPresetsFromComments(videoId) {
  const seenUrls = new Set();
  const presets = [];
  let mainCursor = 0;
  let hasMoreMain = true;
  let mainScanned = 0;
  let replyScanned = 0;

  while (hasMoreMain && mainScanned < 100) {
    const commentApi = `https://www.tiktok.com/api/comment/list/?aid=1988&app_language=id&app_name=tiktok_web&aweme_id=${videoId}&count=50&cursor=${mainCursor}`;
    const commentRes = await upstreamFetch(commentApi, { headers: BASE_HEADERS });
    if (!commentRes.ok) break;

    const commentPayload = await commentRes.json();
    const comments = commentPayload?.comments || [];
    if (!comments.length) break;

    for (const comment of comments) {
      mainScanned++;
      const { presetLinks, otherLinks } = extractPresetLinks(comment.text);

      for (const presetUrl of presetLinks) {
        if (!seenUrls.has(presetUrl)) {
          seenUrls.add(presetUrl);
          presets.push({
            url: presetUrl,
            author: `@${comment.user?.unique_id || 'unknown'} (${comment.user?.nickname || '-'})`,
            source: 'Komentar Utama',
            likes: formatNumber(comment.digg_count),
            date: formatTimestamp(comment.create_time),
            other_links: otherLinks,
          });
        }
      }

      if (comment.reply_comment_total > 0) {
        let replyCursor = 0;
        let hasMoreReplies = true;

        while (hasMoreReplies && replyScanned < 300) {
          const replyApi = `https://www.tiktok.com/api/comment/list/reply/?aid=1988&app_language=id&app_name=tiktok_web&item_id=${videoId}&comment_id=${comment.cid}&count=20&cursor=${replyCursor}`;
          const replyRes = await upstreamFetch(replyApi, { headers: BASE_HEADERS });
          if (!replyRes.ok) break;

          const replyPayload = await replyRes.json();
          const replies = replyPayload?.comments || [];
          if (!replies.length) break;

          replyScanned += replies.length;

          for (const reply of replies) {
            const { presetLinks: replyPresets, otherLinks: replyOtherLinks } = extractPresetLinks(reply.text);

            for (const replyPresetUrl of replyPresets) {
              if (!seenUrls.has(replyPresetUrl)) {
                seenUrls.add(replyPresetUrl);
                presets.push({
                  url: replyPresetUrl,
                  author: `@${reply.user?.unique_id || 'unknown'} (${reply.user?.nickname || '-'})`,
                  source: `Balasan ke @${comment.user?.unique_id || 'unknown'}`,
                  likes: formatNumber(reply.digg_count),
                  date: formatTimestamp(reply.create_time),
                  other_links: replyOtherLinks,
                });
              }
            }
          }

          hasMoreReplies = Boolean(replyPayload.has_more);
          replyCursor = replyPayload.cursor || replyCursor + replies.length;
        }
      }
    }

    hasMoreMain = Boolean(commentPayload.has_more);
    mainCursor = commentPayload.cursor ?? mainCursor + comments.length;
  }

  return {
    scan_stats: {
      main_comments: mainScanned,
      reply_comments: replyScanned,
      total_preset_found: presets.length,
    },
    presets,
  };
}

// ---------- plugin ----------

export default {
  name: 'amfinder',
  description: 'Ekstrak tautan preset Alight Motion dari kolom komentar video TikTok.',
  version: '1.0.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'get',
      path: '/preset',
      summary: 'Extract Alight Motion presets from TikTok comments',
      description: 'Memindai komentar utama dan balasan pada video TikTok untuk menemukan tautan preset Alight Motion.',
      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description: 'URL video TikTok (mendukung tautan pendek vm/vt.tiktok.com)',
          schema: { type: 'string', format: 'uri', maxLength: 2048 },
          example: 'https://vt.tiktok.com/ZSbHnpaX6/',
        },
      ],
      example: {
        video_info: {
          id: '7300000000000000000',
          desc: 'Contoh deskripsi video preset',
          author: { username: 'creator', nickname: 'Creator', verified: false },
          stats: { likes: 1200, comments: 45, shares: 30, views: 15000 },
        },
        scan_stats: {
          main_comments: 50,
          reply_comments: 20,
          total_preset_found: 1,
        },
        presets: [
          {
            url: 'https://alight.link/example',
            author: '@creator (Creator)',
            source: 'Komentar Utama',
            likes: '120',
            date: '17/11/26 13.30.00 WIB',
            other_links: [],
          },
        ],
      },
      async handler(req, res) {
        const rawUrl = requireUrl(req.query.url, 'url', TIKTOK_HOSTS);
        const resolvedUrl = await resolveShortLink(rawUrl);

        const videoId = extractVideoId(resolvedUrl);
        if (!videoId) {
          throw new HttpError(400, 'Invalid request', 'ID video TikTok tidak ditemukan pada URL yang diberikan', 'BadRequestError');
        }

        const [videoInfo, scanResult] = await Promise.all([
          fetchVideoMetadata(videoId),
          scanPresetsFromComments(videoId),
        ]);

        success(
          res,
          {
            video_info: videoInfo,
            ...scanResult,
          },
          'Pemindaian tautan preset selesai',
        );
      },
    },
  ],
};
