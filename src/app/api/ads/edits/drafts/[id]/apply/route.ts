import { validateOrApplyCampaignEdit } from "@/lib/campaign-edit-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await validateOrApplyCampaignEdit(id, { ...body, dryRun: false }, "apply");
    return Response.json({
      ok: true,
      ...result,
      safety: {
        enablePath: false,
        statusMutate: false,
        note: result.dryRun
          ? "validateOnly=true — Google Ads was asked to validate, not apply. No spend."
          : "Applied a safe edit only. Adrunr refused ENABLE / unpause / go-live and has no enable path.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
