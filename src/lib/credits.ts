import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const PAID_ACTIONS = {
  career_roadmap: { credits: 1, label: "Career roadmap" },
  cv_generation: { credits: 1, label: "CV generation" },
  linkedin_rewrite: { credits: 1, label: "LinkedIn rewrite" },
  interview_coaching: { credits: 2, label: "Interview coaching" },
  course_completion: { credits: 1, label: "Course completion" },
  job_unlock: { credits: 1, label: "Job unlock" },
} as const;

export type PaidAction = keyof typeof PAID_ACTIONS;

export async function spendCredits(
  admin: AdminClient,
  userId: string,
  action: PaidAction,
  idempotencyKey: string,
) {
  const definition = PAID_ACTIONS[action];
  const { data, error } = await admin.rpc("consume_credits", {
    p_user_id: userId,
    p_amount: definition.credits,
    p_reason: definition.label,
    p_idempotency_key: `${userId}:${idempotencyKey}`,
  });
  if (error) throw new Error(error.message);
  return data;
}
