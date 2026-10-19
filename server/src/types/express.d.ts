import type { AuthUser } from '../permissions.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
