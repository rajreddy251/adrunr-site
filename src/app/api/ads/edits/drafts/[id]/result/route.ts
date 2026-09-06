import { getCampaignEditResult } from "@/lib/campaign-edit-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await getCampaignEditResult(id);
    return Response.json({ ok: true, ...result, safety: { enablePath: false } });
  } catch (error) {
    return jsonError(error);
  }
}
