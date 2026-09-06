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
      kind?: "SEARCH" | "DISPLAY" | "PMAX";
    };
    const kind = body.kind === "DISPLAY" ? "DISPLAY" : body.kind === "PMAX" ? "PMAX" : "SEARCH";
    const label = kind === "DISPLAY" ? "Display" : kind === "PMAX" ? "Performance Max" : "Search";
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
        note: `Chat can patch ${label} draft fields only. Validate / Create PAUSED stay on the wizard form.`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
