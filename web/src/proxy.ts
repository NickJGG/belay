import { NextResponse, type NextRequest } from "next/server";
import { installedIds, ownerOfPath } from "../../src/extension-ids.ts";
import { isActive } from "../../src/extensions.ts";
import { hostAllowed } from "../../src/guard.ts";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // statusline.sh posts usage with no Origin; the route checks its own loopback Host and refuses any Origin.
  if (pathname === "/api/usage") return NextResponse.next();
  const h = request.headers;
  if (!hostAllowed(h.get("host") ?? undefined, h.get("origin") ?? undefined, request.method, Number(process.env.PORT ?? 4747))) {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (ownerOfPath(pathname, installedIds().filter((id) => !isActive(id)))) {
    if (pathname.startsWith("/api/")) return new NextResponse("not found", { status: 404 });
    // No page lives at /_off, so the root not-found renders, with a 404.
    return NextResponse.rewrite(new URL("/_off", request.url));
  }
  return NextResponse.next();
}
