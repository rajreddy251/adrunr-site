import { NextResponse } from "next/server";

import { revokeActiveConnections } from "@/lib/connections";
import { getEnv } from "@/lib/env";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await revokeActiveConnections();
    return NextResponse.json({ ok: true, connected: false });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET() {
  try {
    await revokeActiveConnections();
    const env = getEnv();
    return NextResponse.redirect(new URL("/ops?disconnected=1", env.appBaseUrl));
  } catch (error) {
    return jsonError(error);
  }
}
