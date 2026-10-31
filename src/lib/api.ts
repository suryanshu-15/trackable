/**
 * Browser API client. Every call goes through the same-origin BFF (/bff/...), which attaches
 * the session token. The server is the source of truth: nothing here caches inventory state
 * beyond React Query's short-lived view cache.
 */

export type ApiErrorBody = { error?: string; message?: string; details?: Record<string, unknown> };

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;
  requestId: string | null;

  constructor(status: number, body: ApiErrorBody, requestId: string | null) {
    super(body.message || `Request failed (${status}).`);
    this.status = status;
    this.code = body.error || 'error';
    this.details = body.details || {};
    this.requestId = requestId;
  }

  /** Field → first message, for showing validation errors next to inputs. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.details)) {
      if (Array.isArray(v) && v.length && typeof v[0] === 'string') out[k] = v[0];
      else if (typeof v === 'string') out[k] = v;
    }
    return out;
  }
}

export type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function toSearch(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((item) => params.append(k, String(item)));
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Path below /api/v1/, e.g. "inventory/packages" (slashes at either end are optional). */
export function bffUrl(path: string, query?: Query): string {
  return `/bff/${path.replace(/^\/+|\/+$/g, '')}${toSearch(query)}`;
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  query?: Query;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

let redirecting = false;

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let resp: Response;
  try {
    resp = await fetch(bffUrl(path, opts.query), {
      method: opts.method || (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: opts.signal,
      credentials: 'same-origin',
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, { error: 'network_error', message: 'Network error — check your connection and try again.' }, null);
  }

  const requestId = resp.headers.get('x-request-id');
  if (resp.status === 401 && typeof window !== 'undefined' && !redirecting) {
    redirecting = true;
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?next=${next}`);
  }
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 300) };
    }
  }
  if (!resp.ok) throw new ApiError(resp.status, (data as ApiErrorBody) || {}, requestId);
  return data as T;
}

export const post = <T = unknown>(path: string, body?: unknown, opts: Omit<Options, 'body' | 'method'> = {}) =>
  api<T>(path, { ...opts, method: 'POST', body: body ?? {} });

export const patch = <T = unknown>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });

export const del = (path: string) => api<void>(path, { method: 'DELETE' });

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Download a protected file (export, document) through the BFF and hand it to the browser. */
export async function download(path: string, query?: Query): Promise<void> {
  const resp = await fetch(bffUrl(path, query), { credentials: 'same-origin' });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new ApiError(resp.status, body, resp.headers.get('x-request-id'));
  }
  const blob = await resp.blob();
  const disposition = resp.headers.get('content-disposition') || '';
  const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] || 'download';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  total_pages: number;
  current_page: number;
  results: T[];
};
