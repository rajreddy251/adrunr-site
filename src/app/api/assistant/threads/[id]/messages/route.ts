import { addAssistantMessage, listAssistantMessages } from "@/lib/assistant-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const messages = await listAssistantMessages(id);
    return Response.json({ ok: true, messages });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      content?: string;
      role?: "USER" | "ASSISTANT" | "SYSTEM";
    };
    const message = await addAssistantMessage({
      threadId: id,
      content: String(body.content ?? ""),
      role: body.role,
    });
    return Response.json({ ok: true, message });
  } catch (error) {
    return jsonError(error);
  }
}
