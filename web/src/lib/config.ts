import "server-only";
import os from "node:os";
import path from "node:path";
import type { SessionRoot } from "./sessions";

/** Where Sear sessions live; the bridge honours the same override. */
export const searDir = () => process.env.SEAR_SESSIONS_DIR ?? path.join(os.homedir(), "Sear", "sessions");

/** Old grill sessions: a frozen archive, read in place and shown read-only. */
export const grillDir = () =>
  process.env.SEAR_GRILL_DIR ?? path.join(os.homedir(), ".claude", "skills", "grill", "sessions");

export const sessionRoots = (): SessionRoot[] => [
  { dir: searDir(), source: "sear" },
  { dir: grillDir(), source: "grill" },
];
