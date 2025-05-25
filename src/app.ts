import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload';
import { FastifyPluginAsync } from 'fastify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const opts: Partial<AutoloadPluginOptions> = {
  ignoreFilter: (path: string) => {
    // Normalize path separators for Windows compatibility
    const normalizedPath = path.replace(/\\/g, '/');
    const pathSegments = normalizedPath.split('/').filter(segment => segment !== '');
    
    // Always ignore .fixed.js files
    if (normalizedPath.includes('.fixed.js')) {
      return true;
    }
    
    // If it's a top-level file, don't ignore it (allow all plugin files)
    if (pathSegments.length <= 1) {
      return false;
    }
    
    // For nested files (in subdirectories), only load index.js files
    const filename = pathSegments[pathSegments.length - 1];
    return filename !== 'index.js';
  },
  forceESM: true,
};

const app: FastifyPluginAsync = async (fastify, _) => {
  // Load plugins first and wait for them to complete
  await fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    ...opts,
  });

  // Then load routes after plugins are ready
  await fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    routeParams: true,
    ...opts,
  });
};

export default app;
