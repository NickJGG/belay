import { NextResponse, type NextRequest } from "next/server";
import { hostAllowed } from "../../src/guard.ts";

export function proxy(request: NextRequest) {
  // statusline.sh posts usage with no Origin; the route checks its own loopback Host and refuses any Origin.
  if (request.nextUrl.pathname === "/api/usage") return NextResponse.next();
  const h = request.headers;
  if (!hostAllowed(h.get("host") ?? undefined, h.get("origin") ?? undefined, request.method, Number(process.env.PORT ?? 4747))) {
    return new NextResponse("forbidden", { status: 403 });
  }
  return NextResponse.next();
}
