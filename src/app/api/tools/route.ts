import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { PAID_ACTIONS, spendCredits, type PaidAction } from "@/lib/credits";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasValidOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const toolActions = {
  roadmap: "career_roadmap",
  cv: "cv_generation",
  linkedin: "linkedin_rewrite",
  interview: "interview_coaching",
} as const satisfies Record<string, PaidAction>;

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function buildPrompt(tool: keyof typeof toolActions, profile: Record<string, unknown>, answer: string) {
  const source = [
    `Full name: ${safeText(profile.full_name, 160)}`,
    `Target role: ${safeText(profile.target_role, 240)}`,
    `Region: ${safeText(profile.target_region, 240)}`,
    `Skills: ${safeText(profile.skills, 1600)}`,
    `Experience summary: ${safeText(profile.resume_bio, 4000)}`,
    `Languages: ${safeText(profile.languages, 300)}`,
  ].join("\n");

  const prompts = {
    roadmap: "Create a realistic 90-day career development roadmap. Separate current evidence, skills to develop, weekly actions, and measurable outcomes. Do not promise salary or employment; mark inferences clearly.",
    cv: "Rewrite the candidate information as an ATS-readable resume draft with a concise summary, skills, and experience bullets. Never invent employers, dates, degrees, metrics, or certifications; use [add details] where evidence is missing.",
    linkedin: "Write three concise LinkedIn headline options and one About section. Use only supplied facts and avoid unsupported claims, contact details, or guarantees.",
    interview: "Give practical interview coaching for this answer. Score Situation, Task, Action, and Result from 0 to 5, cite evidence from the answer, and give two specific improvements. Be constructive; do not infer protected traits.",
  };
  return `${prompts[tool]}\n\nCandidate-provided profile:\n${source}${tool === "interview" ? `\n\nInterview answer:\n${answer}` : ""}`;
}

async function generateWithGemini(prompt: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI service is not configured.");
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1400, temperature: 0.35 } }),
    cache: "no-store", signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("AI generation is temporarily unavailable.");
  const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
  const candidate = result.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text || candidate?.finishReason === "SAFETY") throw new Error("The AI could not safely complete this request.");
  return text.slice(0, 10000);
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const input = body as { tool?: unknown; answer?: unknown; idempotencyKey?: unknown } | null;
  if (!input || typeof input.tool !== "string" || !Object.hasOwn(toolActions, input.tool)) return NextResponse.json({ error: "Unknown career tool." }, { status: 400 });
  const tool = input.tool as keyof typeof toolActions;
  const answer = safeText(input.answer, 5000);
  if (tool === "interview" && answer.length < 30) return NextResponse.json({ error: "Add at least 30 characters for useful interview feedback." }, { status: 400 });
  const action = toolActions[tool];
  const idempotencyKey = typeof input.idempotencyKey === "string" && /^[\da-f-]{36}$/i.test(input.idempotencyKey)
    ? input.idempotencyKey : randomUUID();

  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", auth.user.id).single();
  if (profileError || !profile) return NextResponse.json({ error: "Complete your candidate profile first." }, { status: 400 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "AI service is not configured." }, { status: 503 });

  const admin = createSupabaseAdminClient();
  const { data: aiAllowed, error: rateError } = await admin.rpc("check_ai_rate_limit", { p_user_id: auth.user.id });
  if (rateError) return NextResponse.json({ error: "AI service is temporarily unavailable." }, { status: 503 });
  if (!aiAllowed) return NextResponse.json({ error: "AI tool limit reached. Try again in an hour." }, { status: 429 });
  const { data: balance, error: balanceError } = await admin.rpc("get_credit_balance", { p_user_id: auth.user.id });
  if (balanceError) return NextResponse.json({ error: "Credit balance is not available." }, { status: 503 });
  if (Number(balance) < PAID_ACTIONS[action].credits) return NextResponse.json({ error: "Not enough credits for this tool." }, { status: 402 });

  try {
    // Candidate data is sent to the configured Gemini API only after this authenticated request.
    const output = await generateWithGemini(buildPrompt(tool, profile as unknown as Record<string, unknown>, answer));
    await spendCredits(admin, auth.user.id, action, `tool:${tool}:${idempotencyKey}`);
    return NextResponse.json({ output, creditsUsed: PAID_ACTIONS[action].credits }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Insufficient credits") {
      return NextResponse.json({ error: "Not enough credits for this tool." }, { status: 402 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tool request failed." }, { status: 503 });
  }
}
