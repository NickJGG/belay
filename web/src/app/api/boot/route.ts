import { connection } from "next/server";
import { BOOT } from "@/lib/extension-job";

/** This server process's id: Settings polls it after an install until a rebuilt server answers with a new one. */
export async function GET() {
  await connection();
  return Response.json({ boot: BOOT });
}
