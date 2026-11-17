// Builds an OpenAPI 3.0 spec from core endpoints and loaded plugins, and serves a clean Swagger UI at /docs.
import { APP, CONFIG } from './config.js';

const ERROR_EXAMPLE = {
  status: false,
  code: 400,
  creator: APP.creator,
  message: 'Invalid request',
  error: { type: 'ValidationError', details: 'Parameter "url" is required' },
};

const successResponse = (example) => ({
  description: 'Success',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/SuccessResponse' },
      example: { status: true, code: 200, creator: APP.creator, message: 'Request successful', data: example ?? {} },
    },
  },
});

const errorResponse = (description) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
      example: ERROR_EXAMPLE,
    },
  },
});

const toOpenApiPath = (p) => p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
const fullPath = (name, p) => `/api/${name}${p === '/' ? '' : p}`;

// Short, single-line tag descriptions. Keys are folder (category) names.
const CATEGORY_INFO = {
  downloader: 'Downloader media sosial (Facebook, Instagram, dll.)',
  domain: 'Cek ketersediaan dan informasi domain',
  utility: 'Tools utilitas umum',
  whatsapp: 'Tools pendukung bot WhatsApp',
  general: 'Endpoint lainnya',
};
const CORE_TAG = { name: 'main', description: 'Endpoint utama RyharDev API' };

function operationFor(route, plugin) {
  const declared = route.parameters ?? [];
  const pathNames = [...route.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]);

  const parameters = [
    ...declared.map((p) => ({ in: 'query', required: false, ...p, schema: p.schema ?? { type: 'string' } })),
    ...pathNames
      .filter((n) => !declared.some((p) => p.name === n && p.in === 'path'))
      .map((n) => ({ name: n, in: 'path', required: true, schema: { type: 'string' } })),
  ];

  const operation = {
    tags: [plugin.category],
    summary: `[${plugin.name}] ${route.summary ?? `${route.method.toUpperCase()} ${route.path}`}`,
    description: route.description ?? plugin.description,
    operationId: `${plugin.name}_${route.method}_${route.path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
    parameters,
    responses: {
      200: successResponse(route.example),
      400: errorResponse('Invalid request'),
      404: errorResponse('Resource not found'),
      500: errorResponse('Server error'),
    },
  };

  if (route.requestBody) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: route.requestBody,
          ...(route.requestExample ? { example: route.requestExample } : {}),
        },
      },
    };
  }
  return operation;
}

const coreGet = (summary, operationId, data, parameters = []) => ({
  get: {
    tags: [CORE_TAG.name],
    summary,
    operationId,
    parameters,
    responses: {
      200: successResponse(data),
      404: errorResponse('Resource not found'),
      500: errorResponse('Server error'),
    },
  },
});

const CORE_PATHS = {
  '/api': coreGet('API index', 'core_index', { name: APP.name, version: APP.version }),
  '/api/status': coreGet('Service status', 'core_status', { state: 'ok', pluginsLoaded: 7 }),
  '/api/info': coreGet('Application information', 'core_info', { name: APP.name, creator: APP.creator }),
  '/api/tools': coreGet('List tools (plugins)', 'core_tools', [{ name: 'utility', category: 'utility', version: '1.0.0' }]),
  '/api/tools/{name}': coreGet('Tool detail', 'core_tool_detail', { name: 'utility', endpoints: [] }, [
    { name: 'name', in: 'path', required: true, description: 'Nama plugin', schema: { type: 'string' }, example: 'utility' },
  ]),
};

export function buildSpec(plugins, baseUrl) {
  const paths = { ...CORE_PATHS };

  // Group plugins by category so each category becomes exactly one tag.
  const categories = new Map();
  for (const plugin of plugins) {
    if (!categories.has(plugin.category)) categories.set(plugin.category, []);
    categories.get(plugin.category).push(plugin);

    for (const route of plugin.routes) {
      const key = toOpenApiPath(fullPath(plugin.name, route.path));
      paths[key] = { ...(paths[key] ?? {}), [route.method]: operationFor(route, plugin) };
    }
  }

  // Tag order follows the key order of CATEGORY_INFO; unknown categories come last.
  const order = Object.keys(CATEGORY_INFO);
  const sorted = [...categories.keys()].sort((a, b) => {
    const ia = order.indexOf(a) === -1 ? order.length : order.indexOf(a);
    const ib = order.indexOf(b) === -1 ? order.length : order.indexOf(b);
    return ia - ib;
  });
  const tags = [CORE_TAG];
  for (const category of sorted) {
    tags.push({ name: category, description: CATEGORY_INFO[category] ?? CATEGORY_INFO.general });
  }

  return {
    openapi: '3.0.3',
    info: { title: APP.name, version: APP.version },
    servers: [{ url: baseUrl }],
    tags,
    paths,
    components: {
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            status: { type: 'boolean', example: true },
            code: { type: 'integer', example: 200 },
            creator: { type: 'string', example: APP.creator },
            message: { type: 'string', example: 'Request successful' },
            data: {},
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            status: { type: 'boolean', example: false },
            code: { type: 'integer', example: 400 },
            creator: { type: 'string', example: APP.creator },
            message: { type: 'string', example: 'Invalid request' },
            error: {
              type: 'object',
              properties: {
                type: { type: 'string', example: 'ValidationError' },
                details: { type: 'string', example: 'Invalid parameters' },
              },
            },
          },
        },
      },
    },
  };
}

const baseUrlOf = (req) =>
  CONFIG.publicBaseUrl ? CONFIG.publicBaseUrl.replace(/\/$/, '') : `${req.protocol}://${req.get('host')}`;

const DOCS_CSS = `
:root {
  --bg: #f5f7fb;
  --card: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --get: #2563eb;
  --post: #16a34a;
  --put: #d97706;
  --patch: #0d9488;
  --delete: #dc2626;
}
html, body { margin: 0; background: var(--bg); }
body { font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--text); }

/* Header: hide topbar, long description, and author block; keep title and version only */
.swagger-ui .topbar { display: none; }
.swagger-ui .wrapper { max-width: 1100px; padding: 0 20px; }
.swagger-ui .information-container { padding: 0; }
.swagger-ui .info { margin: 28px 0 20px; }
.swagger-ui .info .title { font-size: 26px; font-weight: 700; color: var(--text); }
.swagger-ui .info .description,
.swagger-ui .info .base-url,
.swagger-ui .info > div > a,
.swagger-ui .info .contact,
.swagger-ui .info .license-info,
.swagger-ui .info .link { display: none !important; }
.swagger-ui .scheme-container { background: transparent; box-shadow: none; padding: 0 0 12px; margin: 0; }
.swagger-ui .models { display: none; }

/* Tag header: one consistent row, single-line description */
.swagger-ui .opblock-tag-section { margin: 0 0 16px; }
.swagger-ui .opblock-tag {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 8px;
  padding: 14px 16px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.swagger-ui .opblock-tag span,
.swagger-ui .opblock-tag a { color: var(--text); font-weight: 600; text-transform: capitalize; white-space: nowrap; }
.swagger-ui .opblock-tag small {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  font-size: 14px;
  font-weight: 400;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.swagger-ui .opblock-tag button { margin-left: auto; }

/* Operation blocks */
.swagger-ui .opblock { margin: 8px 0; border-radius: 10px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05); border-width: 1px; }
.swagger-ui .opblock .opblock-summary { padding: 10px 14px; gap: 12px; }
.swagger-ui .opblock-summary-method {
  min-width: 76px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-shadow: none;
}
.swagger-ui .opblock-summary-path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; font-weight: 600; }
.swagger-ui .opblock-summary-description { color: var(--muted); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.swagger-ui .opblock.opblock-get { background: rgba(37, 99, 235, 0.04); border-color: rgba(37, 99, 235, 0.3); }
.swagger-ui .opblock.opblock-post { background: rgba(22, 163, 74, 0.04); border-color: rgba(22, 163, 74, 0.3); }
.swagger-ui .opblock.opblock-put { background: rgba(217, 119, 6, 0.04); border-color: rgba(217, 119, 6, 0.3); }
.swagger-ui .opblock.opblock-patch { background: rgba(13, 148, 136, 0.04); border-color: rgba(13, 148, 136, 0.3); }
.swagger-ui .opblock.opblock-delete { background: rgba(220, 38, 38, 0.04); border-color: rgba(220, 38, 38, 0.3); }
.swagger-ui .opblock.opblock-get .opblock-summary-method { background: var(--get); }
.swagger-ui .opblock.opblock-post .opblock-summary-method { background: var(--post); }
.swagger-ui .opblock.opblock-put .opblock-summary-method { background: var(--put); }
.swagger-ui .opblock.opblock-patch .opblock-summary-method { background: var(--patch); }
.swagger-ui .opblock.opblock-delete .opblock-summary-method { background: var(--delete); }

/* Mobile */
@media (max-width: 640px) {
  .swagger-ui .wrapper { padding: 0 12px; }
  .swagger-ui .info .title { font-size: 22px; }
  .swagger-ui .opblock-tag { padding: 12px; font-size: 15px; gap: 8px; }
  .swagger-ui .opblock-tag small { font-size: 12px; }
  .swagger-ui .opblock .opblock-summary { padding: 8px 10px; gap: 8px; flex-wrap: wrap; }
  .swagger-ui .opblock-summary-method { min-width: 60px; font-size: 12px; }
  .swagger-ui .opblock-summary-path { font-size: 12px; word-break: break-all; }
  .swagger-ui .opblock-summary-description { display: none; }
}
`;

const DOCS_HTML = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RyharDev API - Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
  <style>${DOCS_CSS}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: -1,
        displayRequestDuration: true,
        tryItOutEnabled: true,
      });
    };
  </script>
</body>
</html>`;

export function mountDocs(app, plugins) {
  app.get('/openapi.json', (req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(buildSpec(plugins, baseUrlOf(req)));
  });
  app.get('/docs', (req, res) => res.type('html').send(DOCS_HTML));
}
