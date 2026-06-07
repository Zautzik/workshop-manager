import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate-limiter';

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export function buildRateLimitActor(req: NextRequest, userId?: string | null): string {
  return userId ? `user:${userId}` : `ip:${getClientIp(req)}`;
}

interface RouteRateLimitOptions {
  req: NextRequest;
  key: string;
  limit: number;
  windowMs: number;
  message?: string;
}

export function enforceRouteRateLimit(options: RouteRateLimitOptions): NextResponse | null {
  const result = checkRateLimit(options.key, options.limit, options.windowMs);

  if (result.ok) return null;

  return NextResponse.json(
    { error: options.message ?? 'Too Many Requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds(result)),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.floor(result.resetAt / 1000)),
      },
    },
  );
}
