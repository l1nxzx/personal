import type { ApiErrorBody } from '../../../shared/types';
import { today } from './dates';

/** Backend on Render. VITE_API_URL overrides it (e.g. "/api" to use the Vite dev proxy). */
export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  'https://personal-2-phi0.onrender.com/api';

/** Identifies this tab so it can ignore realtime echoes of its own changes. */
export const CLIENT_ID = Math.random().toString(36).slice(2, 12);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never reached the server (offline, DNS, dropped connection). */
export class NetworkError extends Error {
  constructor() {
    super("Can't reach the server. Check your connection.");
    this.name = 'NetworkError';
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface ApiOptions extends Omit<RequestInit, 'body' | 'method'> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Plain objects are sent as JSON; FormData is sent as-is (file uploads). */
  body?: unknown;
  query?: Query;
  /** Internal: set on the retry after a token refresh. */
  retried?: boolean;
}

// These endpoints must never trigger a silent refresh-and-retry.
const NO_REFRESH = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time; concurrent 401s share the same request. */
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

export async function apiFetch<T = void>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, query, retried, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  finalHeaders.set('X-Client-Id', CLIENT_ID);
  // Lets the server count what is done on this device's own day (the profile's usage history).
  finalHeaders.set('X-Local-Date', today());
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary
  } else if (body instanceof Blob || body instanceof ArrayBuffer) {
    payload = body; // raw bytes (e.g. encrypted vault files); caller sets Content-Type
  } else if (body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      ...rest,
      method,
      headers: finalHeaders,
      body: payload,
      credentials: 'include',
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new NetworkError();
  }

  if (res.status === 401 && !retried && !NO_REFRESH.has(path) && (await refreshSession())) {
    return apiFetch<T>(path, { ...options, retried: true });
  }

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      err?.error.code ?? 'UNKNOWN',
      err?.error.message ??
        (res.status >= 500 ? 'The server had a problem. Try again.' : res.statusText),
      err?.error.details,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A sentence suitable for showing to the person, for any thrown value. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  return fallback;
}
