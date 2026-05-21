import { NextRequest, NextResponse } from 'next/server';

/**
 * Edge middleware — attaches a request ID to every /api/* request.
 *
 * The ID is sourced from the incoming 'x-request-id' header so upstream
 * load-balancers / proxies can supply their own trace IDs; otherwise a new
 * UUID is generated.
 *
 * The ID is forwarded:
 *   • to the API route via the request headers (readable with req.headers.get('x-request-id'))
 *   • back to the client via the response headers (useful for support debugging)
 *
 * API routes can attach it to log lines:
 *   const requestId = req.headers.get('x-request-id') ?? 'unknown';
 *   logger.info({ requestId }, 'handler called');
 */
export function middleware(req: NextRequest) {
	const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

	// Clone headers and inject the request ID so API route handlers can read it.
	const requestHeaders = new Headers(req.headers);
	requestHeaders.set('x-request-id', requestId);

	const res = NextResponse.next({
		request: { headers: requestHeaders },
	});

	// Echo the ID in the response so clients / curl can correlate with server logs.
	res.headers.set('x-request-id', requestId);

	return res;
}

export const config = {
	matcher: '/api/:path*',
};
