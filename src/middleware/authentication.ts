import type { NextFunction, Request, Response } from 'express';
import { authenticateApiKey } from '../modules/api-keys/application/apiKeyUseCases.js';
import { authenticateToken } from '../modules/auth/application/authUseCases.js';
import { unauthorized } from '../shared/errors/AppError.js';

const bearer = (req: Request) => req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

/** Dashboard users: JWT in "Authorization: Bearer <token>". */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) throw unauthorized();
  req.admin = await authenticateToken(token);
  next();
}

/** Client applications: project API key in "Authorization: Bearer <key>" or "X-API-Key". */
export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  const key = (req.headers['x-api-key'] as string | undefined)?.trim() || bearer(req);
  if (!key) throw unauthorized('API key required');
  req.project = await authenticateApiKey(key);
  next();
}
