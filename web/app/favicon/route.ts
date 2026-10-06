import type { NextRequest } from 'next/server';
import { accent } from '@/lib/accents';
import { settings } from '@/lib/data';

/** The favicon in the chosen accent. The layout links it as `?a=<accent>`, so the URL changes with the setting and each variant can be cached for good. */
export function GET(req: NextRequest) {
  const fill = accent(req.nextUrl.searchParams.get('a') ?? settings().accent).dark;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${fill}"/>
  <g transform="translate(3.52 3.52) scale(0.78)" fill="none" stroke="#0c0d0f" stroke-linecap="round" stroke-linejoin="round">
    <path stroke-width="3" d="M11 8.5 A5 5 0 0 1 16 3.5 H18 A7 7 0 0 1 25 10.5 V21.5 A7 7 0 0 1 18 28.5 H15 A5 5 0 0 1 10 23.5 L11 8.5"/>
    <path stroke-width="6.5" d="M10.3 20.5 L10.7 14.5"/>
  </g>
</svg>`;
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
