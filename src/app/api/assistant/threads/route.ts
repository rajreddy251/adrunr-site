import { createAssistantThread, listAssistantThreads } from "@/lib/assistant-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const threads = await listAssistantThreads({
      clientId: url.searchParams.get("clientId"),
      draftId: url.searchParams.get("draftId"),
    });
    return Response.json({ ok: true, threads });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      clientId?: string;
      draftId?: string;
      title?: string;
    };
    const thread = await createAssistantThread(body);
    return Response.json({ ok: true, thread });
  } catch (error) {
    return jsonError(error);
  }
}
