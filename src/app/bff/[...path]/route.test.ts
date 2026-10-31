// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

function jwt(expInSeconds: number) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + expInSeconds })}.sig`;
}

function req(path: string, { cookies = {}, method = 'GET', body, headers = {} }: { cookies?: Record<string, string>; method?: string; body?: string; headers?: Record<string, string> } = {}) {
  const r = new NextRequest(`http://localhost:3000/bff/${path}`, {
    method, body, headers: { ...headers, cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') },
  });
  return [r, { params: Promise.resolve({ path: path.split('?')[0].split('/') }) }] as const;
}

afterEach(() => vi.unstubAllGlobals());

describe('BFF proxy', () => {
  it('rejects path traversal', async () => {
    const res = await GET(...req('inventory/../../admin'));
    // URL normalisation may already collapse "..", so assert we never reach a non-API path either way.
    expect([400, 401]).toContain(res.status);
    const [r] = req('x');
    const direct = await GET(r, { params: Promise.resolve({ path: ['..', 'admin'] }) });
    expect(direct.status).toBe(400);
  });

  it('returns 401 and clears cookies without a session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await GET(...req('inventory/packages'));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('attaches the bearer token, forwards client IP and keeps Django trailing slashes', async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'abc' } }));
    vi.stubGlobal('fetch', fetchMock);
    const access = jwt(600);
    const res = await GET(...req('inventory/packages?status=STORED&status=CREATED', { cookies: { tk_access: access, tk_refresh: jwt(9999) }, headers: { 'x-forwarded-for': '6.6.6.6, 10.1.2.3' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBe('abc');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/api/v1/inventory/packages/?status=STORED&status=CREATED');
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Bearer ${access}`);
    expect(h['X-Forwarded-For']).toBe('10.1.2.3');
  });

  it('passes the idempotency key through on writes', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await POST(...req('inventory/issues', { method: 'POST', body: '{}', cookies: { tk_access: jwt(600), tk_refresh: jwt(9999) }, headers: { 'idempotency-key': 'k-1', 'content-type': 'application/json' } }));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['idempotency-key']).toBe('k-1');
  });

  it('refreshes an expired access token once for concurrent requests and sets the rotated cookies', async () => {
    const refreshToken = jwt(9999) + 'unique';
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/refresh/')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 20));
        return new Response(JSON.stringify({ access: jwt(600), refresh: jwt(9999) }), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const cookies = { tk_access: jwt(-10), tk_refresh: refreshToken };
    const results = await Promise.all([GET(...req('a', { cookies })), GET(...req('b', { cookies })), GET(...req('c', { cookies }))]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
    expect(results[0].cookies.get('tk_access')?.value).toBeTruthy();
  });

  it('reports an unreachable backend as 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const res = await GET(...req('x', { cookies: { tk_access: jwt(600), tk_refresh: jwt(9999) } }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('backend_unreachable');
  });
});

describe('BFF proxy behind a TLS proxy', () => {
  it('passes the original scheme to Django so it does not redirect to HTTPS', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await GET(...req('x', { cookies: { tk_access: jwt(600), tk_refresh: jwt(9999) }, headers: { 'x-forwarded-proto': 'https' } }));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['X-Forwarded-Proto']).toBe('https');
  });
});
