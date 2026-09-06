import { assistantKindLabel, parseAssistantCampaignKind } from "@/lib/assistant";
import { runAssistantTurn } from "@/lib/assistant-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      message?: string;
      threadId?: string;
      draftId?: string;
      clientId?: string;
      customerId?: string;
      kind?: string;
    };
    const kind = parseAssistantCampaignKind(body.kind);
    const result = await runAssistantTurn({
      message: String(body.message ?? ""),
      threadId: body.threadId,
      draftId: body.draftId,
      clientId: body.clientId,
      customerId: body.customerId,
      kind,
    });
    return Response.json({
      ok: true,
      ...result,
      safety: {
        validatePath: false,
        applyPath: false,
        enablePath: false,
        note: `Chat can patch ${assistantKindLabel(kind)} draft fields only. Validate / Create PAUSED stay on the wizard form.`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
