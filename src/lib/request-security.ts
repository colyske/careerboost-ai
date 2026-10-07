export function hasValidOrigin(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;
  const origin = request.headers.get("origin");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin || !siteUrl) return false;
  try { return new URL(origin).origin === new URL(siteUrl).origin; }
  catch { return false; }
}
