import { jsonError } from "@/lib/http";
import { validateOrApplyLocalServicesDraft } from "@/lib/local-services-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await validateOrApplyLocalServicesDraft(id, { ...body, dryRun: false }, "apply");
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
