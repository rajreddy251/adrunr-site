import { jsonError } from "@/lib/http";
import { getCampaignOpDetail } from "@/lib/search-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const campaignOp = await getCampaignOpDetail(id);
    return Response.json({ ok: true, campaignOp });
  } catch (error) {
    return jsonError(error);
  }
}
