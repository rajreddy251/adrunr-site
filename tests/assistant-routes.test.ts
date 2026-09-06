import { beforeEach, describe, expect, it, vi } from "vitest";

const runAssistantTurn = vi.fn();
const listAssistantThreads = vi.fn();
const createAssistantThread = vi.fn();

vi.mock("@/lib/assistant-ops", () => ({
  runAssistantTurn: (...args: unknown[]) => runAssistantTurn(...args),
  listAssistantThreads: (...args: unknown[]) => listAssistantThreads(...args),
  createAssistantThread: (...args: unknown[]) => createAssistantThread(...args),
}));

import { detectForbiddenAssistantIntent, parseAssistantCampaignKind } from "@/lib/assistant";
import { POST as postTurn } from "@/app/api/assistant/turn/route";
import { GET as getThreads, POST as postThreads } from "@/app/api/assistant/threads/route";

function searchDraftNotFound(): Error {
  return Object.assign(new Error("Search campaign draft not found for this client."), {
    status: 404,
    info: { kind: "rbac", hint: "Assistant threads cannot read another client's drafts." },
  });
}

describe("assistant campaign kind routing", () => {
  it("accepts SHOPPING the same way as VIDEO and does not fall through to Search", () => {
    expect(parseAssistantCampaignKind("SHOPPING")).toBe("SHOPPING");
    expect(parseAssistantCampaignKind("VIDEO")).toBe("VIDEO");
    expect(parseAssistantCampaignKind("SEARCH")).toBe("SEARCH");
    expect(parseAssistantCampaignKind(undefined)).toBe("SEARCH");
    expect(parseAssistantCampaignKind("unknown")).toBe("SEARCH");
  });

  it("accepts APP the same way as SHOPPING and does not fall through to Search", () => {
    expect(parseAssistantCampaignKind("APP")).toBe("APP");
    expect(parseAssistantCampaignKind("SHOPPING")).toBe("SHOPPING");
    expect(parseAssistantCampaignKind("SEARCH")).toBe("SEARCH");
  });
});

describe("assistant HTTP routes", () => {
  beforeEach(() => {
    runAssistantTurn.mockReset();
    listAssistantThreads.mockReset();
    createAssistantThread.mockReset();

    runAssistantTurn.mockImplementation(async (input: { kind?: string; draftId?: string; message?: string }) => {
      if (input.kind !== "SHOPPING") {
        throw searchDraftNotFound();
      }
      const refusedAction = detectForbiddenAssistantIntent(String(input.message ?? ""));
      return {
        thread: {
          id: "thread-shop",
          kind: "SHOPPING",
          shoppingDraftId: input.draftId,
          draftId: null,
        },
        draft: { id: input.draftId, name: "Adrunr paused Shopping" },
        questions: [],
        patchedFields: [],
        source: "mock",
        refusedAction,
      };
    });

    listAssistantThreads.mockImplementation(async (input: { kind?: string; draftId?: string }) => {
      if (input.kind !== "SHOPPING") {
        throw searchDraftNotFound();
      }
      return [{ id: "thread-shop", kind: "SHOPPING", shoppingDraftId: input.draftId, draftId: null }];
    });

    createAssistantThread.mockImplementation(async (input: { kind?: string; draftId?: string }) => {
      if (input.kind !== "SHOPPING") {
        throw searchDraftNotFound();
      }
      return { id: "thread-shop", kind: "SHOPPING", shoppingDraftId: input.draftId, draftId: null };
    });
  });

  it("POST /api/assistant/turn with kind SHOPPING + shopping draftId refuses validate and does not 404 as Search", async () => {
    const response = await postTurn(
      new Request("http://localhost/api/assistant/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Validate this",
          draftId: "shopping-draft-1",
          kind: "SHOPPING",
        }),
      }),
    );
    const json = (await response.json()) as {
      ok: boolean;
      error?: string;
      refusedAction?: string | null;
      safety?: { validatePath?: boolean; applyPath?: boolean; enablePath?: boolean; note?: string };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.error).toBeUndefined();
    expect(json.refusedAction).toBe("validate");
    expect(json.safety?.validatePath).toBe(false);
    expect(json.safety?.applyPath).toBe(false);
    expect(json.safety?.enablePath).toBe(false);
    expect(json.safety?.note).toMatch(/Shopping/);
    expect(json.safety?.note).not.toMatch(/Search/);
    expect(runAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "SHOPPING",
        draftId: "shopping-draft-1",
        message: "Validate this",
      }),
    );
  });

  it("POST /api/assistant/turn with kind SHOPPING + shopping draftId refuses apply and does not 404 as Search", async () => {
    const response = await postTurn(
      new Request("http://localhost/api/assistant/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Apply CREATE PAUSED",
          draftId: "shopping-draft-1",
          kind: "SHOPPING",
        }),
      }),
    );
    const json = (await response.json()) as { ok: boolean; error?: string; refusedAction?: string | null };
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.error).toBeUndefined();
    expect(json.refusedAction).toBe("apply");
    expect(runAssistantTurn.mock.calls[0][0].kind).toBe("SHOPPING");
  });

  it("GET /api/assistant/threads?kind=SHOPPING loads the shoppingDraftId path, not Search", async () => {
    const response = await getThreads(
      new Request("http://localhost/api/assistant/threads?kind=SHOPPING&draftId=shopping-draft-1"),
    );
    const json = (await response.json()) as { ok: boolean; error?: string; threads?: Array<{ kind: string }> };
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.error).toBeUndefined();
    expect(json.threads?.[0].kind).toBe("SHOPPING");
    expect(listAssistantThreads).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "SHOPPING", draftId: "shopping-draft-1" }),
    );
  });

  it("POST /api/assistant/threads with kind SHOPPING binds shoppingDraftId, not Search", async () => {
    const response = await postThreads(
      new Request("http://localhost/api/assistant/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "SHOPPING", draftId: "shopping-draft-1" }),
      }),
    );
    const json = (await response.json()) as { ok: boolean; error?: string; thread?: { kind: string } };
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.error).toBeUndefined();
    expect(json.thread?.kind).toBe("SHOPPING");
    expect(createAssistantThread).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "SHOPPING", draftId: "shopping-draft-1" }),
    );
  });
});

describe("assistant HTTP routes — APP kind", () => {
  beforeEach(() => {
    runAssistantTurn.mockReset();
    listAssistantThreads.mockReset();
    createAssistantThread.mockReset();

    runAssistantTurn.mockImplementation(async (input: { kind?: string; draftId?: string; message?: string }) => {
      if (input.kind !== "APP") {
        throw searchDraftNotFound();
      }
      const refusedAction = detectForbiddenAssistantIntent(String(input.message ?? ""));
      return {
        thread: {
          id: "thread-app",
          kind: "APP",
          appDraftId: input.draftId,
          draftId: null,
        },
        draft: { id: input.draftId, name: "Adrunr paused App" },
        questions: [],
        patchedFields: [],
        source: "mock",
        refusedAction,
      };
    });

    listAssistantThreads.mockImplementation(async (input: { kind?: string; draftId?: string }) => {
      if (input.kind !== "APP") {
        throw searchDraftNotFound();
      }
      return [{ id: "thread-app", kind: "APP", appDraftId: input.draftId, draftId: null }];
    });

    createAssistantThread.mockImplementation(async (input: { kind?: string; draftId?: string }) => {
      if (input.kind !== "APP") {
        throw searchDraftNotFound();
      }
      return { id: "thread-app", kind: "APP", appDraftId: input.draftId, draftId: null };
    });
  });

  it("POST /api/assistant/turn with kind APP + app draftId refuses validate and does not 404 as Search", async () => {
    const response = await postTurn(
      new Request("http://localhost/api/assistant/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Validate this",
          draftId: "app-draft-1",
          kind: "APP",
        }),
      }),
    );
    const json = (await response.json()) as {
      ok: boolean;
      error?: string;
      refusedAction?: string | null;
      safety?: { validatePath?: boolean; applyPath?: boolean; enablePath?: boolean; note?: string };
    };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.error).toBeUndefined();
    expect(json.refusedAction).toBe("validate");
    expect(json.safety?.validatePath).toBe(false);
    expect(json.safety?.applyPath).toBe(false);
    expect(json.safety?.enablePath).toBe(false);
    expect(json.safety?.note).toMatch(/App/);
    expect(json.safety?.note).not.toMatch(/Search/);
    expect(runAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "APP",
        draftId: "app-draft-1",
        message: "Validate this",
      }),
    );
  });

  it("POST /api/assistant/turn with kind APP + app draftId refuses apply and does not 404 as Search", async () => {
    const response = await postTurn(
      new Request("http://localhost/api/assistant/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Apply CREATE PAUSED",
          draftId: "app-draft-1",
          kind: "APP",
        }),
      }),
    );
    const json = (await response.json()) as { ok: boolean; error?: string; refusedAction?: string | null };
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.error).toBeUndefined();
    expect(json.refusedAction).toBe("apply");
    expect(runAssistantTurn.mock.calls[0][0].kind).toBe("APP");
  });

  it("GET /api/assistant/threads?kind=APP loads the appDraftId path, not Search", async () => {
    const response = await getThreads(
      new Request("http://localhost/api/assistant/threads?kind=APP&draftId=app-draft-1"),
    );
    const json = (await response.json()) as { ok: boolean; error?: string; threads?: Array<{ kind: string }> };
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.error).toBeUndefined();
    expect(json.threads?.[0].kind).toBe("APP");
    expect(listAssistantThreads).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "APP", draftId: "app-draft-1" }),
    );
  });

  it("POST /api/assistant/threads with kind APP binds appDraftId, not Search", async () => {
    const response = await postThreads(
      new Request("http://localhost/api/assistant/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "APP", draftId: "app-draft-1" }),
      }),
    );
    const json = (await response.json()) as { ok: boolean; error?: string; thread?: { kind: string } };
    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.error).toBeUndefined();
    expect(json.thread?.kind).toBe("APP");
    expect(createAssistantThread).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "APP", draftId: "app-draft-1" }),
    );
  });
});
