import { jsonError } from "@/lib/http";
import { getOpsSnapshot } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await getOpsSnapshot();
    return Response.json({ ok: true, audit: snapshot.audit, context: snapshot.context });
  } catch (error) {
    return jsonError(error);
  }
}
