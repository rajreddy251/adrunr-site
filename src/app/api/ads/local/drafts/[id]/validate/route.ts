import { jsonError } from "@/lib/http";
import { validateOrApplyLocalDraft } from "@/lib/local-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await validateOrApplyLocalDraft(id, { ...body, dryRun: true }, "validate");
    return Response.json({
      ok: true,
      ...result,
      safety: {
        status: "PAUSED",
        enablePath: false,
        note: "validateOnly=true — Google Ads was asked to validate the full Local tree, not apply. No spend.",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
