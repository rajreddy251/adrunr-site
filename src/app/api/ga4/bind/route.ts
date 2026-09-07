import { bindGa4Property } from "@/lib/ga4";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { propertyId?: string };
    const result = await bindGa4Property(body.propertyId ?? "");
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
