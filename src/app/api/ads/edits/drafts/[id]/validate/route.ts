import { validateOrApplyCampaignEdit } from "@/lib/campaign-edit-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await validateOrApplyCampaignEdit(id, { ...body, dryRun: true }, "validate");
    return Response.json({
      ok: true,
      ...result,
      safety: {
        enablePath: false,
        statusMutate: false,
        note: "validateOnly=true — Google Ads was asked to validate the safe edit, not apply. No spend.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
