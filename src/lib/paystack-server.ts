import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { transactionMatchesOrder, type PaystackTransaction } from "@/lib/payment-primitives";

export async function verifyPaystackTransaction(reference: string): Promise<PaystackTransaction> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error("Payment verification is not configured.");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Payment provider verification failed.");
  const result = await response.json() as { status?: boolean; data?: PaystackTransaction };
  if (!result.status || !result.data) throw new Error("Payment provider returned no transaction.");
  return result.data;
}

export async function applyVerifiedPayment(reference: string, transaction: PaystackTransaction) {
  if (!transaction.id || !Number.isSafeInteger(transaction.amount) || !transaction.currency) {
    throw new Error("Payment details are incomplete.");
  }
  const admin = createSupabaseAdminClient();
  const { data: order, error: orderError } = await admin.from("payment_orders").select("*").eq("reference", reference).single();
  if (orderError || !order) throw new Error("Payment order was not found.");
  if (order.status === "success") return;
  if (!transactionMatchesOrder(transaction, order)) throw new Error("Verified Paystack transaction does not match the order.");
  const { error } = await admin.rpc("apply_verified_payment", {
    p_reference: reference,
    p_provider_transaction_id: String(transaction.id),
    p_amount_subunits: transaction.amount,
    p_currency: transaction.currency,
  });
  if (error) throw new Error(error.message);
}
