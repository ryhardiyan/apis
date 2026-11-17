// Instagram: post/reel media links (/download).
import { success, requireUrl, HttpError } from '../../src/response.js';
import { upstreamFetch } from '../../src/http.js';

const IG_HOSTS = ['instagram.com', 'www.instagram.com'];

// Parses the HTML returned by the media endpoint into { thumbnail, download } pairs.
function parseMedia(body) {
  const decoded = body.replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const re =
    /<img\s+src="(https:\/\/cdn\.instasave\.website\/\?token=[^"]+)"[\s\S]*?<a\s+href="(https:\/\/cdn\.instasave\.website\/\?token=[^"]+)"/g;
  return [...decoded.matchAll(re)].map((m) => ({ thumbnail: m[1], download: m[2] }));
}

export default {
  name: 'instasave',
  description: 'Link download foto/video/reel Instagram (media post dan reel).',
  version: '1.1.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'get',
      path: '/download',
      summary: 'Get Instagram media links',
      description: 'Link download untuk post atau reel publik. Setiap item berisi thumbnail dan link download.',
      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description: 'URL post atau reel Instagram publik',
          schema: { type: 'string', format: 'uri', maxLength: 2048 },
          example: 'https://www.instagram.com/reel/CxExample/',
        },
      ],
      example: {
        count: 1,
        items: [{ thumbnail: 'https://cdn.instasave.website/?token=example', download: 'https://cdn.instasave.website/?token=example2' }],
      },
      async handler(req, res) {
        const target = requireUrl(req.query.url, 'url', IG_HOSTS);

        const upstream = await upstreamFetch('https://api.instasave.website/media', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: 'https://instasave.website',
            Referer: 'https://instasave.website/',
          },
          body: new URLSearchParams({ url: target, lang: 'en' }).toString(),
          timeout: 10000,
        });
        if (!upstream.ok) throw new HttpError(502, 'Upstream error', 'Media service returned an unexpected response', 'UpstreamError');

        const items = parseMedia(await upstream.text());
        if (items.length === 0) {
          throw new HttpError(404, 'Not found', 'No media found. The post may be private or unavailable', 'NotFoundError');
        }
        success(res, { count: items.length, items }, 'Media retrieved');
      },
    },
  ],
};
