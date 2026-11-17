// Instagram: oEmbed metadata (/info, needs INSTAGRAM_APP_TOKEN) and post/reel media links (/download).
import { success, requireUrl, HttpError } from '../../src/response.js';
import { upstreamFetch } from '../../src/http.js';

const IG_HOSTS = ['instagram.com', 'www.instagram.com'];
const GRAPH_VERSION = 'v21.0';

// Parses the HTML returned by the media endpoint into { thumbnail, download } pairs.
function parseMedia(body) {
  const decoded = body.replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const re =
    /<img\s+src="(https:\/\/cdn\.instasave\.website\/\?token=[^"]+)"[\s\S]*?<a\s+href="(https:\/\/cdn\.instasave\.website\/\?token=[^"]+)"/g;
  return [...decoded.matchAll(re)].map((m) => ({ thumbnail: m[1], download: m[2] }));
}

export default {
  name: 'instagram',
  description: 'Metadata post Instagram (oEmbed) dan link download foto/video/reel (media post dan reel).',
  version: '1.1.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'get',
      path: '/info',
      summary: 'Get Instagram post info (oEmbed)',
      description: 'Metadata publik dari post Instagram. Membutuhkan konfigurasi INSTAGRAM_APP_TOKEN di server.',
      parameters: [
        {
          name: 'url',
          in: 'query',
          required: true,
          description: 'URL post Instagram',
          schema: { type: 'string', format: 'uri', maxLength: 2048 },
          example: 'https://www.instagram.com/p/CxExample/',
        },
      ],
      example: {
        title: 'Contoh caption post',
        author_name: 'instagram',
        thumbnail_url: 'https://scontent.cdninstagram.com/example.jpg',
        provider_name: 'Instagram',
      },
      async handler(req, res) {
        const token = process.env.INSTAGRAM_APP_TOKEN;
        if (!token) {
          throw new HttpError(503, 'Service unavailable', 'Instagram oEmbed is not configured on this server', 'ServiceUnavailable');
        }
        const target = requireUrl(req.query.url, 'url', IG_HOSTS);

        const endpoint = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/instagram_oembed`);
        endpoint.searchParams.set('url', target);
        endpoint.searchParams.set('access_token', token);
        endpoint.searchParams.set('omitscript', 'true');

        const upstream = await upstreamFetch(endpoint, { headers: { Accept: 'application/json' }, timeout: 8000 });
        if (upstream.status === 400 || upstream.status === 404) {
          throw new HttpError(404, 'Not found', 'Post not found or unavailable', 'NotFoundError');
        }
        if (!upstream.ok) throw new HttpError(502, 'Upstream error', 'Instagram returned an unexpected response', 'UpstreamError');

        const data = await upstream.json();
        success(
          res,
          {
            title: data.title ?? null,
            author_name: data.author_name ?? null,
            thumbnail_url: data.thumbnail_url ?? null,
            provider_name: data.provider_name ?? 'Instagram',
          },
          'Post info retrieved',
        );
      },
    },
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
