import { jsonError } from "@/lib/http";
import { getConnectionStatus } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const body = await getConnectionStatus();
    return Response.json(body);
  } catch (error) {
    return jsonError(error);
  }
}
