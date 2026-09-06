import { jsonError } from "@/lib/http";
import { validateOrApplyLocalServicesDraft } from "@/lib/local-services-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await validateOrApplyLocalServicesDraft(id, { ...body, dryRun: true }, "validate");
    return Response.json({
      ok: true,
      ...result,
      safety: {
        status: "PAUSED",
        enablePath: false,
        note: "validateOnly=true — Google Ads was asked to validate the full Local Services tree, not apply. No spend.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
