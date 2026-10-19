import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '../../../shared/types.js';
import { AppError } from '../lib/errors.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody['error'] = { code: 'INTERNAL', message: 'Something went wrong' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, details: err.details };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    body = { code: 'UPLOAD_ERROR', message: err.message };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'BAD_JSON', message: 'Malformed JSON body' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' };
  }

  if (status >= 500) req.log.error({ err }, 'unhandled error');
  if (res.headersSent) return res.end();
  res.status(status).json({ error: body } satisfies ApiErrorBody);
};
