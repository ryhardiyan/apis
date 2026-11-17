// Plugin loader, plugin mounting, and core endpoints (/api, /api/status, /api/info, /api/tools).
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { APP, CONFIG } from './config.js';
import { success, HttpError } from './response.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_DIR = path.resolve(here, '..', 'plugins');
export const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const NAME_PATTERN = /^[a-z0-9-]+$/;
const RESERVED = ['api', 'status', 'info', 'tools', 'docs', 'openapi.json'];

// Validates the shape of a plugin. Throws with a readable message if invalid.
export function validatePlugin(plugin, file) {
  if (!plugin || typeof plugin !== 'object') throw new Error('default export must be an object');

  const errors = [];
  const { name, description, version, author, routes } = plugin;

  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    errors.push('"name" must match /^[a-z0-9-]+$/');
  } else if (RESERVED.includes(name)) {
    errors.push(`"name" "${name}" is reserved`);
  } else if (name !== path.basename(file, '.js')) {
    errors.push('"name" must match the file name');
  }
  if (typeof description !== 'string' || !description) errors.push('"description" is required');
  if (typeof version !== 'string' || !version) errors.push('"version" is required');
  if (typeof author !== 'string' || !author) errors.push('"author" is required');

  if (!Array.isArray(routes) || routes.length === 0) {
    errors.push('"routes" must be a non-empty array');
  } else {
    routes.forEach((route, i) => {
      const r = route ?? {};
      if (!METHODS.includes(r.method)) errors.push(`routes[${i}].method must be one of ${METHODS.join(', ')}`);
      if (typeof r.path !== 'string' || !r.path.startsWith('/')) errors.push(`routes[${i}].path must start with "/"`);
      if (typeof r.handler !== 'function') errors.push(`routes[${i}].handler must be a function`);
    });
  }

  if (errors.length) throw new Error(errors.join('; '));
  return plugin;
}

// Lists plugin files: plugins/*.js (category "general") and plugins/<category>/*.js.
// Files and folders starting with "_" are ignored.
async function listPluginFiles(errors) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const entries = (await readdir(PLUGIN_DIR, { withFileTypes: true })).sort(byName);
  const found = [];

  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;

    if (entry.isFile() && entry.name.endsWith('.js')) {
      found.push({ category: 'general', file: entry.name, abs: path.join(PLUGIN_DIR, entry.name) });
    } else if (entry.isDirectory()) {
      if (!NAME_PATTERN.test(entry.name)) {
        errors.push({ file: `${entry.name}/`, error: 'category folder name must match /^[a-z0-9-]+$/' });
        continue;
      }
      const subs = (await readdir(path.join(PLUGIN_DIR, entry.name), { withFileTypes: true })).sort(byName);
      for (const sub of subs) {
        if (sub.isFile() && sub.name.endsWith('.js') && !sub.name.startsWith('_')) {
          found.push({
            category: entry.name,
            file: `${entry.name}/${sub.name}`,
            abs: path.join(PLUGIN_DIR, entry.name, sub.name),
          });
        }
      }
    }
  }
  return found;
}

// Reads plugins at cold start. Broken plugins are skipped and recorded; the API keeps running.
export async function loadPlugins() {
  const plugins = [];
  const disabled = [];
  const errors = [];

  let candidates = [];
  try {
    candidates = await listPluginFiles(errors);
  } catch {
    errors.push({ file: 'plugins/', error: 'plugin directory cannot be read' });
    console.error('[plugin] plugins/ directory cannot be read');
    return { plugins, disabled, errors };
  }

  for (const { category, file, abs } of candidates) {
    try {
      const mod = await import(pathToFileURL(abs).href);
      const plugin = validatePlugin(mod.default, file);

      if (plugin.enabled === false || CONFIG.disabledPlugins.includes(plugin.name)) {
        disabled.push(plugin.name);
        continue;
      }
      if (plugins.some((p) => p.name === plugin.name)) {
        throw new Error(`duplicate plugin name "${plugin.name}"`);
      }
      plugins.push({ ...plugin, category });
    } catch (err) {
      errors.push({ file, error: err.message });
      console.error(`[plugin] failed to load ${file}: ${err.message}`);
    }
  }

  console.info(`[plugin] loaded ${plugins.length} plugin(s) in ${new Set(plugins.map((p) => p.category)).size} category(ies)`);
  return { plugins, disabled, errors };
}

// Wraps async handlers so rejected promises reach the Express error handler.
const wrap = (handler) => (req, res, next) =>
  Promise.resolve()
    .then(() => handler(req, res))
    .catch(next);

// Each plugin gets its own router, mounted at /api/<plugin-name>.
export function mountPlugins(app, plugins) {
  for (const plugin of plugins) {
    const router = express.Router();
    for (const route of plugin.routes) {
      router[route.method](route.path, wrap(route.handler));
    }
    app.use(`/api/${plugin.name}`, router);
  }
}

const summarize = (plugin) => ({
  name: plugin.name,
  category: plugin.category,
  description: plugin.description,
  version: plugin.version,
  author: plugin.author,
  routes: plugin.routes.length,
});

export function createCoreRouter({ plugins, errors, disabled }) {
  const router = express.Router();
  const startedAt = Date.now();

  router.get('/api', (req, res) =>
    success(
      res,
      {
        name: APP.name,
        version: APP.version,
        docs: '/docs',
        openapi: '/openapi.json',
        endpoints: ['/api/status', '/api/info', '/api/tools', '/api/tools/:name'],
      },
      'RyharDev API is running',
    ),
  );

  router.get('/api/status', (req, res) =>
    success(
      res,
      {
        state: 'ok',
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        pluginsLoaded: plugins.length,
        pluginsFailed: errors.length,
        pluginsDisabled: disabled.length,
        timestamp: new Date().toISOString(),
      },
      'Service status',
    ),
  );

  router.get('/api/info', (req, res) =>
    success(
      res,
      {
        name: APP.name,
        version: APP.version,
        description: APP.description,
        creator: APP.creator,
        developer: APP.developer,
        license: APP.license,
        repository: APP.repository,
        docs: '/docs',
      },
      'Application information',
    ),
  );

  router.get('/api/tools', (req, res) =>
    success(res, plugins.map(summarize), 'Tool list retrieved'),
  );

  router.get('/api/tools/:name', (req, res) => {
    const plugin = plugins.find((p) => p.name === req.params.name);
    if (!plugin) {
      throw new HttpError(404, 'Tool not found', `No tool named "${req.params.name}"`, 'NotFoundError');
    }
    success(
      res,
      {
        ...summarize(plugin),
        endpoints: plugin.routes.map((r) => ({
          method: r.method.toUpperCase(),
          path: `/api/${plugin.name}${r.path === '/' ? '' : r.path}`,
          summary: r.summary ?? null,
        })),
      },
      'Tool detail retrieved',
    );
  });

  return router;
}
