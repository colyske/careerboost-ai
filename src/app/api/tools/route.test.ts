import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { getUser } })),
}));

vi.mock("@/lib/request-security", () => ({
  hasValidOrigin: vi.fn(() => true),
}));

import { POST } from "./route";

describe("POST /api/tools", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: "candidate-1" } }, error: null });
  });

  it.each([undefined, false, "true"])("rejects profile processing without explicit boolean consent (%s)", async (consent) => {
    const response = await POST(new Request("https://careerboost.test/api/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://careerboost.test" },
      body: JSON.stringify({ tool: "cv", ...(consent === undefined ? {} : { consent }) }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Consent is required before profile data is sent to AI.",
    });
  });
});
