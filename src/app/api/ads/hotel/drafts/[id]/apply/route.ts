import { jsonError } from "@/lib/http";
import { validateOrApplyHotelDraft } from "@/lib/hotel-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await validateOrApplyHotelDraft(id, { ...body, dryRun: false }, "apply");
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
