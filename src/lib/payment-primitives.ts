import { createHmac, timingSafeEqual } from "node:crypto";
import type { CreditPackage } from "@/lib/database.types";

const packages = [
  { id: "starter", label: "Starter", credits: 10, priceEnv: "PAYSTACK_STARTER_AMOUNT_SUBUNITS" },
  { id: "pro", label: "Pro", credits: 30, priceEnv: "PAYSTACK_PRO_AMOUNT_SUBUNITS" },
  { id: "executive", label: "Executive", credits: 75, priceEnv: "PAYSTACK_EXECUTIVE_AMOUNT_SUBUNITS" },
] as const;

export function listCreditPackages(): CreditPackage[] {
  const currency = (process.env.PAYSTACK_CURRENCY || "KES").toUpperCase();
  const supportedCurrency = ["KES", "NGN", "GHS", "ZAR", "USD"].includes(currency);
  return packages.map((bundle) => {
    const parsed = Number(process.env[bundle.priceEnv]);
    return { id: bundle.id, label: bundle.label, credits: bundle.credits, currency,
      amountSubunits: supportedCurrency && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null };
  });
}

export function getCreditPackage(id: unknown): CreditPackage | null {
  if (typeof id !== "string") return null;
  return listCreditPackages().find((bundle) => bundle.id === id) ?? null;
}

export function verifyPaystackSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f\d]{128}$/i.test(signature)) return false;
  const received = Buffer.from(signature, "hex");
  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export type PaystackTransaction = {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  customer?: { email?: string };
  id?: number | string;
};

export function transactionMatchesOrder(
  transaction: PaystackTransaction,
  order: { reference: string; amount_subunits: number; currency: string; email: string },
): boolean {
  return (
    transaction.status === "success" && transaction.reference === order.reference &&
    transaction.amount === order.amount_subunits &&
    transaction.currency?.toUpperCase() === order.currency.toUpperCase() &&
    transaction.customer?.email?.toLowerCase() === order.email.toLowerCase()
  );
}
