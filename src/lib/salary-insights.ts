const usStates = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

export function parseWageAmount(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function normalizeUsWageLocation(value: string) {
  const location = value.trim().replace(/\s+/g, " ");
  if (/^US\s*,\s*0$/i.test(location)) return "US, 0";
  if (/^\d{5}(?:-\d{4})?$/.test(location)) return location;
  if (/^[a-zA-Z]{2}$/.test(location)) return usStates.has(location.toUpperCase()) ? location.toUpperCase() : null;
  const cityAndState = /^([a-zA-Z .'-]{2,80}),\s*([a-zA-Z]{2})$/.exec(location);
  if (cityAndState && usStates.has(cityAndState[2].toUpperCase())) return `${cityAndState[1].trim()}, ${cityAndState[2].toUpperCase()}`;
  return null;
}
