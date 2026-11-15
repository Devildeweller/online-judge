import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
};

interface HttpLikeError {
  status?: number;
  statusCode?: number;
  type?: string;
  code?: string;
  message?: string;
  meta?: { target?: unknown };
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  const e = (err ?? {}) as HttpLikeError;

  // Prisma: unique constraint / record not found
  if (e.code === 'P2002') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these values already exists', details: e.meta?.target } });
    return;
  }
  if (e.code === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    return;
  }

  // body-parser
  if (e.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    return;
  }
  if (e.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Request body is not valid JSON' } });
    return;
  }

  logger.error({ err, method: req.method, path: req.path }, 'unhandled request error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side' } });
};
