import { listGa4Properties } from "@/lib/ga4";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await listGa4Properties();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
