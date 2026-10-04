import { NextResponse, type NextRequest } from 'next/server';
import { hostAllowed } from '../src/guard.ts';

export function proxy(request: NextRequest) {
  const h = request.headers;
  if (!hostAllowed(h.get('host') ?? undefined, h.get('origin') ?? undefined, request.method, Number(process.env.PORT))) {
    return new NextResponse('forbidden', { status: 403 });
  }
  return NextResponse.next();
}
