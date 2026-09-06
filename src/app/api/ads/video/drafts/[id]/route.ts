import { deleteVideoDraft, getVideoDraft, updateVideoDraft } from "@/lib/video-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const draft = await getVideoDraft(id);
    return Response.json({ ok: true, draft });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const draft = await updateVideoDraft(id, body);
    return Response.json({ ok: true, draft });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  return PATCH(request, context);
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await deleteVideoDraft(id);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
