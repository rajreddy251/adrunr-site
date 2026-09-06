import { createCampaignEditDraft, listCampaignEditDrafts } from "@/lib/campaign-edit-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const customerId = new URL(request.url).searchParams.get("customerId") ?? undefined;
    const drafts = await listCampaignEditDrafts(customerId);
    return Response.json({
      ok: true,
      drafts,
      safety: { enablePath: false, note: "Edit drafts never enable or unpause live Ads." },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const draft = await createCampaignEditDraft(body);
    return Response.json({
      ok: true,
      draft,
      safety: { enablePath: false, note: "Draft stored. Validate (dry-run) before apply." },
    });
  } catch (error) {
    return jsonError(error);
  }
}
