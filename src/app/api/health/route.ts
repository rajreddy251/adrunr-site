import { getEnv } from "@/lib/env";
import { pingDatabase } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const env = getEnv();
  const db = env.databaseUrl ? await pingDatabase() : false;
  return Response.json({
    ok: true,
    service: "adrunr-site",
    mockMode: env.mockMode,
    database: db ? "neon" : env.databaseUrl ? "unreachable" : "unset",
    safety: "paused-default dry-run-preferred no-enable-path",
  });
}
