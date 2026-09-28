import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env.js';
import { openApiDocument } from '../docs/openapi.js';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler.js';
import { requestLogger } from '../middleware/requestLogger.js';
import { healthRoutes } from '../modules/health/presentation/healthRoutes.js';
import { apiRoutes } from './routes.js';

// backend/public, from both src/app and dist/app.
const PUBLIC_DIR = fileURLToPath(new URL('../../public', import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind one reverse proxy (nginx/IIS) in production

  app.use(requestLogger);
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL.split(',').map((o) => o.trim()), maxAge: 600 }));
  app.use(
    express.json({
      limit: '1mb',
      // Raw bytes are needed to verify provider webhook signatures.
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );

  app.use(healthRoutes); // /health, /health/live, /health/ready
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'Vengurla Messaging API' }));
  app.get('/api/docs.json', (_req, res) => res.json(openApiDocument));
  app.use('/api/v1', apiRoutes());

  // Dashboard build (frontend `npm run build` writes it here). Unknown non-API GETs get index.html for client routing.
  if (existsSync(`${PUBLIC_DIR}/index.html`)) {
    app.use(express.static(PUBLIC_DIR));
    app.get('/{*path}', (req, res, next) => (req.path.startsWith('/api/') ? next() : res.sendFile('index.html', { root: PUBLIC_DIR })));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
