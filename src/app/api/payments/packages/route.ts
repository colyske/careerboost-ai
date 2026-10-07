import { NextResponse } from "next/server";
import { listCreditPackages } from "@/lib/payment-primitives";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ packages: listCreditPackages() }, { headers: { "Cache-Control": "no-store" } });
}
