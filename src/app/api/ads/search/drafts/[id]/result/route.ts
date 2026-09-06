import { jsonError } from "@/lib/http";
import { getSearchDraftResult } from "@/lib/search-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await getSearchDraftResult(id);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
