const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const routes = ["/", "/api/feeds", "/auth/callback", "/c/example"];
const required = [
  "content-security-policy",
  "permissions-policy",
  "referrer-policy",
  "x-content-type-options",
  "x-frame-options",
];

for (const route of routes) {
  const response = await fetch(new URL(route, baseUrl), { redirect: "manual" });
  for (const header of required) {
    if (!response.headers.has(header)) throw new Error(`${route} is missing ${header}`);
  }
  if (response.headers.has("x-powered-by")) throw new Error(`${route} exposes X-Powered-By`);
}

console.log(`Security headers verified on ${routes.length} representative routes.`);
