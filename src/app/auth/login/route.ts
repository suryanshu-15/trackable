import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL, forwardingHeaders, setSessionCookies } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let credentials: { username?: string; password?: string };
  try {
    credentials = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid request.', details: {} }, { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/api/v1/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardingHeaders(req) },
      body: JSON.stringify({ username: credentials.username ?? '', password: credentials.password ?? '' }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'backend_unreachable', message: 'The server could not be reached.', details: {} },
      { status: 502 },
    );
  }
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });

  const res = NextResponse.json({ user: data.user });
  setSessionCookies(res, { access: data.access, refresh: data.refresh });
  return res;
}
