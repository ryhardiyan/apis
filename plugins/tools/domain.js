// Domain check via NS lookup. This is only an indication, not an official registrar check.
// A domain with no NS records is reported as "likelyAvailable".
import { Resolver } from 'node:dns/promises';
import { success, requireString, HttpError } from '../../src/response.js';

const resolver = new Resolver();
resolver.setServers(['1.1.1.1', '8.8.8.8']);

const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/;

export default {
  name: 'domain',
  description: 'Cek indikasi ketersediaan domain lewat lookup NS (bukan cek registrar resmi).',
  version: '1.0.0',
  author: 'RyharDev',
  routes: [
    {
      method: 'get',
      path: '/check',
      summary: 'Check domain (NS lookup)',
      parameters: [
        {
          name: 'domain',
          in: 'query',
          required: true,
          description: 'Nama domain tanpa http/https, contoh example.com',
          schema: { type: 'string', maxLength: 253 },
          example: 'example.com',
        },
      ],
      example: { domain: 'example.com', hasNameServers: true, likelyAvailable: false, note: 'NS lookup only, not a registrar check' },
      async handler(req, res) {
        const domain = requireString(req.query.domain, 'domain', { max: 253 }).trim().toLowerCase();
        if (!DOMAIN_PATTERN.test(domain)) throw new HttpError(400, 'Invalid request', 'Parameter "domain" is not a valid domain name');

        let hasNameServers;
        try {
          const ns = await resolver.resolveNs(domain);
          hasNameServers = ns.length > 0;
        } catch (err) {
          if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
            hasNameServers = false;
          } else {
            throw new HttpError(502, 'Upstream error', 'DNS lookup failed, try again later', 'UpstreamError');
          }
        }

        success(
          res,
          {
            domain,
            hasNameServers,
            likelyAvailable: !hasNameServers,
            note: 'NS lookup only, not a registrar check',
          },
          'Domain checked',
        );
      },
    },
  ],
};
