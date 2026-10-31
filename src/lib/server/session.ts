/**
 * Server-only JWT session handling for the BFF (backend-for-frontend).
 *
 * Tokens live in httpOnly cookies so page scripts can never read them. The browser only
 * talks to this Next.js app; route handlers attach the bearer token and call Django.
 */
import type { NextRequest, NextResponse } from 'next/server';

export const ACCESS_COOKIE = 'tk_access';
export const REFRESH_COOKIE = 'tk_refresh';

export const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');

const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production';

export type Tokens = { access: string; refresh: string };

/** Seconds until the JWT expires (negative when expired, -Infinity when unreadable). */
export function secondsLeft(token: string | undefined): number {
  if (!token) return -Infinity;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.exp - Date.now() / 1000;
  } catch {
    return -Infinity;
  }
}

export function setSessionCookies(res: NextResponse, tokens: Tokens) {
  const base = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
  res.cookies.set(ACCESS_COOKIE, tokens.access, { ...base, maxAge: Math.max(60, Math.floor(secondsLeft(tokens.access))) });
  res.cookies.set(REFRESH_COOKIE, tokens.refresh, { ...base, maxAge: Math.max(60, Math.floor(secondsLeft(tokens.refresh))) });
}

export function clearSessionCookies(res: NextResponse) {
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
}

/**
 * Headers that let Django see the real client (login throttling and audit IPs are per client).
 * The rightmost X-Forwarded-For entry is the one our reverse proxy appended; earlier entries
 * come from the client and could be forged to dodge the login throttle.
 */
export function forwardingHeaders(req: NextRequest): Record<string, string> {
  const chain = (req.headers.get('x-forwarded-for') || '').split(',').map((x) => x.trim()).filter(Boolean);
  const ip = chain.at(-1) || req.headers.get('x-real-ip') || '127.0.0.1';
  const headers: Record<string, string> = {
    'X-Forwarded-For': ip,
    // Behind a TLS-terminating proxy this is "https"; Django trusts it (SECURE_PROXY_SSL_HEADER)
    // and would otherwise redirect every API call to HTTPS.
    'X-Forwarded-Proto': req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || req.nextUrl.protocol.replace(':', ''),
  };
  const requestId = req.headers.get('x-request-id');
  if (requestId) headers['X-Request-ID'] = requestId;
  return headers;
}

// Refresh tokens rotate and the old one is blacklisted, so concurrent requests that all find
// an expired access token must share one refresh call. Results are kept briefly so requests
// still carrying the old refresh cookie get the rotated pair instead of failing.
const inflight = new Map<string, Promise<Tokens | null>>();
const recent = new Map<string, { tokens: Tokens; at: number }>();
const RECENT_MS = 30_000;

export function refreshTokens(refresh: string, req: NextRequest): Promise<Tokens | null> {
  const hit = recent.get(refresh);
  if (hit && Date.now() - hit.at < RECENT_MS) return Promise.resolve(hit.tokens);
  const pending = inflight.get(refresh);
  if (pending) return pending;

  const p = (async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/api/v1/auth/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...forwardingHeaders(req) },
        body: JSON.stringify({ refresh }),
        cache: 'no-store',
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const tokens = { access: data.access, refresh: data.refresh ?? refresh };
      recent.set(refresh, { tokens, at: Date.now() });
      for (const [k, v] of recent) if (Date.now() - v.at > RECENT_MS) recent.delete(k);
      return tokens;
    } catch {
      return null;
    } finally {
      inflight.delete(refresh);
    }
  })();
  inflight.set(refresh, p);
  return p;
}
