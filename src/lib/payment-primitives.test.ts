import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCreditPackage, listCreditPackages, transactionMatchesOrder, verifyPaystackSignature } from "./payment-primitives";

describe("credit package configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not enable a package with missing or fractional pricing", () => {
    vi.stubEnv("PAYSTACK_CURRENCY", "KES");
    vi.stubEnv("PAYSTACK_STARTER_AMOUNT_SUBUNITS", "");
    vi.stubEnv("PAYSTACK_PRO_AMOUNT_SUBUNITS", "2499.5");
    vi.stubEnv("PAYSTACK_EXECUTIVE_AMOUNT_SUBUNITS", "12500");
    const bundles = listCreditPackages();
    expect(bundles.map((bundle) => bundle.amountSubunits)).toEqual([null, null, 12500]);
  });

  it("rejects unsupported currencies and unknown bundles", () => {
    vi.stubEnv("PAYSTACK_CURRENCY", "XXX");
    vi.stubEnv("PAYSTACK_STARTER_AMOUNT_SUBUNITS", "1000");
    expect(getCreditPackage("starter")?.amountSubunits).toBeNull();
    expect(getCreditPackage("admin")).toBeNull();
    expect(getCreditPackage({})).toBeNull();
  });
});

describe("Paystack signature verification", () => {
  const secret = "server-only-test-secret";
  const body = '{"event":"charge.success","data":{"reference":"gr_test"}}';
  const signature = createHmac("sha512", secret).update(body).digest("hex");

  it("accepts only the HMAC for the exact raw request body", () => {
    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
    expect(verifyPaystackSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyPaystackSignature(body, signature, "wrong-secret")).toBe(false);
  });

  it("rejects missing and malformed signatures", () => {
    expect(verifyPaystackSignature(body, null, secret)).toBe(false);
    expect(verifyPaystackSignature(body, "not-a-signature", secret)).toBe(false);
  });
});

describe("verified transaction matching", () => {
  const order = { reference: "gr_abc", amount_subunits: 2500, currency: "KES", email: "candidate@example.test" };
  const transaction = { id: 234, status: "success", reference: "gr_abc", amount: 2500, currency: "KES", customer: { email: "candidate@example.test" } };

  it("accepts an exact provider-confirmed transaction", () => {
    expect(transactionMatchesOrder(transaction, order)).toBe(true);
  });

  it.each([
    { ...transaction, status: "pending" },
    { ...transaction, reference: "gr_other" },
    { ...transaction, amount: 2499 },
    { ...transaction, currency: "USD" },
    { ...transaction, customer: { email: "attacker@example.test" } },
    { ...transaction, customer: undefined },
  ])("rejects a mismatched provider transaction", (tampered) => {
    expect(transactionMatchesOrder(tampered, order)).toBe(false);
  });
});
