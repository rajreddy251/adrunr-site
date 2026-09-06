import {
  deleteCampaignEditDraft,
  getCampaignEditDraft,
  updateCampaignEditDraft,
} from "@/lib/campaign-edit-ops";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const draft = await getCampaignEditDraft(id);
    return Response.json({ ok: true, draft, safety: { enablePath: false } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const draft = await updateCampaignEditDraft(id, body);
    return Response.json({ ok: true, draft, safety: { enablePath: false } });
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
    const result = await deleteCampaignEditDraft(id);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
