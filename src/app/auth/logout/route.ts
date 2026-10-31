import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE, BACKEND_URL, REFRESH_COOKIE, clearSessionCookies, forwardingHeaders } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  if (refresh) {
    // Blacklist the refresh token so it cannot be reused; sign out locally even if this fails.
    await fetch(`${BACKEND_URL}/api/v1/auth/logout/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        ...forwardingHeaders(req),
      },
      body: JSON.stringify({ refresh }),
      cache: 'no-store',
    }).catch(() => undefined);
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
