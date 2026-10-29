import { tsEnvFiles } from "../../../_lib/ts-env-files";

let files: Record<string, string> | null = null;

/** Declaration files for the Work editor's TypeScript worker, which asks with `?v=<ts version>`, so they cache for good. */
export function GET() {
  files ??= tsEnvFiles(/*turbopackIgnore: true*/ process.cwd());
  return Response.json(files, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
}
