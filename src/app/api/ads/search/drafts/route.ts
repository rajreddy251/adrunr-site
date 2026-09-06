import { createSearchDraft, listSearchDrafts } from "@/lib/search-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const drafts = await listSearchDrafts();
    return Response.json({ ok: true, drafts });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const draft = await createSearchDraft(body);
    return Response.json({ ok: true, draft });
  } catch (error) {
    return jsonError(error);
  }
}
