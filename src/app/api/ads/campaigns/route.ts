import { createPausedSearchCampaign } from "@/lib/google-ads";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await createPausedSearchCampaign(body);
    return Response.json({
      ok: true,
      ...result,
      safety: {
        status: "PAUSED",
        enablePath: false,
        note: result.dryRun
          ? "validateOnly=true — Google Ads was asked to validate, not apply. No spend."
          : "Applied as PAUSED only. Adrunr has no enable/go-live action.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
