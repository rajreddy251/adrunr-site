import { runGa4SampleReport } from "@/lib/ga4";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runGa4SampleReport();
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
