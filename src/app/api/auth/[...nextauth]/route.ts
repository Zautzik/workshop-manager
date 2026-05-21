import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { checkRateLimit, retryAfterSeconds } from '@/lib/rate-limiter';
import { NextRequest, NextResponse } from 'next/server';

const nextAuthHandler = NextAuth(authOptions);

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export function GET(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }) {
  return nextAuthHandler(req, ctx);
}

export function POST(req: NextRequest, ctx: { params: Promise<{ nextauth: string[] }> }) {
  // NextAuth routes all CredentialsProvider sign-ins through
  // /api/auth/callback/credentials. Rate limit by IP: 5 attempts per 60 s
  // is generous for human users but stops credential-stuffing loops.
  if (req.nextUrl.pathname.endsWith('/callback/credentials')) {
    const ip = clientIp(req);
    const result = checkRateLimit(`login:${ip}`, 5, 60_000);
    if (!result.ok) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait before trying again.' },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds(result)) },
        },
      );
    }
  }
  return nextAuthHandler(req, ctx);
}
