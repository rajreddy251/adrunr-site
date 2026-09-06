import { jsonError } from "@/lib/http";
import { getConnectionStatus } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getConnectionStatus();
    return Response.json({ ok: true, providers: status.providers });
  } catch (error) {
    return jsonError(error);
  }
}
