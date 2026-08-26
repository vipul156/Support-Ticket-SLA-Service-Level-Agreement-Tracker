/** GraphQL Yoga server: schema-first SDL + resolver map, JWT context, SPA hosting. */

import { createYoga, createSchema } from 'graphql-yoga';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from './config.js';
import { resolvers } from './graphql/resolvers/index.js';
import { buildServices } from './graphql/context.js';
import type { GraphQLContext } from './graphql/context.js';
import { extractBearer, verifyToken } from './auth/index.js';
import type { AuthUser } from './auth/index.js';

const config = loadConfig();
const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
const services = buildServices(prisma, config);

const __dirname = dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(join(__dirname, 'graphql', 'schema', 'schema.graphql'), 'utf8');

// Static SPA hosting: when the built frontend exists next to the API it is
// served from the same origin so /graphql and the app share one port.
const publicDir = process.env.PUBLIC_DIR ?? join(__dirname, '..', 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

function sendFile(
  res: import('node:http').ServerResponse,
  filePath: string,
  status = 200,
): void {
  const body = readFileSync(filePath);
  res.writeHead(status, {
    'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': extname(filePath) === '.html' ? 'no-store' : 'public, max-age=3600',
  });
  res.end(body);
}

function serveStatic(
  pathname: string,
  res: import('node:http').ServerResponse,
): boolean {
  if (!existsSync(publicDir)) return false;
  const safe = pathname.replace(/\/+$/, '');
  let filePath = join(publicDir, safe === '' ? 'index.html' : safe);
  if (!filePath.startsWith(publicDir)) return false;
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback for client-side routes (hash routing also works without this).
    filePath = join(publicDir, 'index.html');
    if (!existsSync(filePath)) return false;
  }
  sendFile(res, filePath);
  return true;
}

function currentUserFromToken(request: { headers: { get(name: string): string | null } }): AuthUser | null {
  const header = request.headers.get('authorization');
  if (header === null) return null;
  const token = extractBearer(header);
  if (token === null) return null;
  try {
    const payload = verifyToken(token, config.jwtSecret);
    return { id: payload.sub, name: '', email: '', role: payload.role };
  } catch {
    return null;
  }
}

async function hydrateUser(user: AuthUser | null): Promise<AuthUser | null> {
  if (user === null) return null;
  const fresh = await services.users.findById(user.id);
  if (fresh === null) return null;
  return { id: fresh.id, name: fresh.name, email: fresh.email, role: fresh.role };
}

const schema = createSchema<GraphQLContext>({ typeDefs, resolvers });
const yoga = createYoga<GraphQLContext, GraphQLContext>({
  schema,
  context: async ({ request }): Promise<GraphQLContext> => ({
    currentUser: await hydrateUser(currentUserFromToken(request)),
    prisma,
    services,
    config,
  }),
  graphqlEndpoint: '/graphql',
  landingPage: false,
});

export { yoga, config };

const server = createServer((req, res) => {
  const pathname = (req.url ?? '/').split('?')[0] ?? '/';
  if (pathname === '/graphql' || pathname === '/health') {
    yoga(req, res);
    return;
  }
  if (req.method === 'GET' && serveStatic(pathname, res)) return;
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});
server.listen(config.port, () => {
  console.log(`Server ready on http://localhost:${config.port} (GraphQL at /graphql)`);
});
