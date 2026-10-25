import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { searDir } from "@/lib/config";
import { IMAGE_TYPES, imageName, MAX_IMAGE_BYTES } from "@/lib/images";
import { sameOrigin } from "@/lib/same-origin";
import { isSlug } from "@/lib/sessions";

/** Stores one picture (the raw bytes as the body, its type as Content-Type) in the session's `images/`; answers `{name}`. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSlug(slug)) return Response.json({ error: "bad slug" }, { status: 404 });
  if (!sameOrigin(request)) return Response.json({ error: "cross-origin" }, { status: 403 });
  const ext = IMAGE_TYPES[request.headers.get("content-type")?.split(";")[0].trim() ?? ""];
  if (!ext) return Response.json({ error: "PNG, JPEG, GIF or WebP only" }, { status: 415 });
  const tooBig = Response.json({ error: "Over 10 MB" }, { status: 413 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return tooBig;
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX_IMAGE_BYTES) return tooBig;
  if (!body.length) return Response.json({ error: "empty" }, { status: 400 });
  const dir = path.join(searDir(), slug, "images");
  await mkdir(dir, { recursive: true });
  const name = imageName(ext);
  await writeFile(path.join(dir, name), body, { flag: "wx" });
  return Response.json({ name });
}
