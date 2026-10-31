import { NextRequest, NextResponse } from 'next/server';

// Page routes need a session cookie; the API proxy (/bff) answers 401 itself.
export function middleware(req: NextRequest) {
  if (req.cookies.get('tk_refresh')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!login|auth/|bff/|_next/|favicon.ico|icon.svg|robots.txt).*)'],
};
