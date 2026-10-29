/**
 * The site's built-in extension list: each extension's pure descriptor from `(browse)/(<id>)/_lib/manifest.ts`. Its
 * server and client contributions join as `manifest.server.ts` and `manifest.client.tsx` with their first slots.
 */
import { manifest as grill } from "@/app/(browse)/(grill)/_lib/manifest";
import { manifest as learn } from "@/app/(browse)/(learn)/_lib/manifest";

export const MANIFESTS = [grill, learn] as const;
