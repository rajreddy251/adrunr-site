import "server-only";

import {
  assistantSystemPrompt,
  mockAssistantTurn,
  parseAssistantTurnPlan,
  type AssistantContextPack,
  type AssistantTurnPlan,
} from "./assistant";
import { getEnv, llmConfigured } from "./env";

export async function planAssistantTurn(input: {
  message: string;
  pack: AssistantContextPack;
}): Promise<{ plan: AssistantTurnPlan; source: "mock" | "llm" }> {
  const env = getEnv();
  if (!llmConfigured(env)) {
    return { plan: mockAssistantTurn(input), source: "mock" };
  }

  const response = await fetch(`${env.llmBaseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.llmApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.llmModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: assistantSystemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            instruction: input.message,
            context_pack: input.pack,
          }),
        },
      ],
    }),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw Object.assign(new Error(`Assistant model request failed (${response.status}).`), {
      status: 502,
      info: { kind: "llm", hint: "Check ADRUNR_LLM_BASE_URL / ADRUNR_LLM_API_KEY, or set ADRUNR_MOCK=1." },
    });
  }

  let parsed: unknown = {};
  try {
    const json = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
    parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
  } catch {
    parsed = {};
  }
  return { plan: parseAssistantTurnPlan(parsed), source: "llm" };
}
