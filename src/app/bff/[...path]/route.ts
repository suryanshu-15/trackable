/**
 * Authenticated proxy: /bff/<path> → Django /api/v1/<path>/.
 * Attaches the bearer token from the httpOnly cookie, refreshes it when needed, and
 * streams the response back unchanged (JSON, CSV/XLSX exports, PNGs and document downloads).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE, BACKEND_URL, REFRESH_COOKIE, Tokens, clearSessionCookies, forwardingHeaders, refreshTokens,
  secondsLeft, setSessionCookies,
} from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const PASS_REQUEST = ['content-type', 'accept', 'idempotency-key'];
const PASS_RESPONSE = ['content-type', 'content-disposition', 'x-request-id', 'cache-control'];

async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (path.some((seg) => seg === '..' || seg === '.' || seg.includes('\\'))) {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid path.', details: {} }, { status: 400 });
  }
  const target = `${BACKEND_URL}/api/v1/${path.map(encodeURIComponent).join('/')}/${req.nextUrl.search}`;

  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  let rotated: Tokens | null = null;

  if (secondsLeft(access) < 30 && refresh) {
    rotated = await refreshTokens(refresh, req);
    if (rotated) access = rotated.access;
  }
  if (!access || secondsLeft(access) <= 0) {
    const res = NextResponse.json(
      { error: 'not_authenticated', message: 'Your session has ended. Please sign in again.', details: {} },
      { status: 401 },
    );
    clearSessionCookies(res);
    return res;
  }

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();
  const send = (token: string) => {
    const headers: Record<string, string> = { ...forwardingHeaders(req), Authorization: `Bearer ${token}` };
    for (const h of PASS_REQUEST) {
      const v = req.headers.get(h);
      if (v) headers[h] = v;
    }
    return fetch(target, { method: req.method, headers, body, cache: 'no-store', redirect: 'manual' });
  };

  let upstream: Response;
  try {
    upstream = await send(access);
    // The access token may have been revoked or rotated elsewhere; retry once after a refresh.
    if (upstream.status === 401 && refresh && !rotated) {
      rotated = await refreshTokens(refresh, req);
      if (rotated) upstream = await send(rotated.access);
    }
  } catch {
    return NextResponse.json(
      { error: 'backend_unreachable', message: 'The server could not be reached. Check your connection and try again.', details: {} },
      { status: 502 },
    );
  }

  const headers = new Headers();
  for (const h of PASS_RESPONSE) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  const res = new NextResponse(upstream.body, { status: upstream.status, headers });
  if (upstream.status === 401) clearSessionCookies(res);
  else if (rotated) setSessionCookies(res, rotated);
  return res;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
