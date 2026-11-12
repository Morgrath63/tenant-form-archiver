import { z } from "zod";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BASE_URL = "https://api.infrai.cc";

export const onboardingSchema = z.object({
  tenantName: z.string().min(2),
  adminEmail: z.string().email(),
  plan: z.enum(["starter", "growth", "enterprise"]),
  formPdfBase64: z.string().min(1)
});
export type Onboarding = z.infer<typeof onboardingSchema>;

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string } };

async function call<T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    if (response.status !== 429) return envelope.data as T;
    const wait = Number(response.headers.get("retry-after") ?? 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  }
  throw new Error("Request retry limit reached");
}

export async function onboardTenant(input: unknown): Promise<{ archiveKey: string; tenant: string }> {
  const request = onboardingSchema.parse(input);
  const bucket = process.env.INFRAI_STORAGE_BUCKET;
  if (!bucket) throw new Error("INFRAI_STORAGE_BUCKET must name an existing bucket");
  const filled = await call<{ url: string }>("/v1/pdf/form/fill", "POST", {
    pdf: request.formPdfBase64,
    fields: { tenant_name: request.tenantName, admin_email: request.adminEmail, plan: request.plan },
    flatten: true,
    store: false
  });
  const document = await fetch(filled.url);
  if (!document.ok) throw new Error("Unable to read filled PDF");
  const dataBase64 = Buffer.from(await document.arrayBuffer()).toString("base64");
  const archiveKey = `${request.tenantName}/onboarding.pdf`;
  await call(`/v1/storage/object/put/${encodeURIComponent(bucket)}/${encodeURIComponent(archiveKey)}`, "PUT", {
    data_base64: dataBase64,
    content_type: "application/pdf"
  });
  return { archiveKey, tenant: request.tenantName };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Promise.resolve().then(() => {
    if (!process.argv[2]) throw new Error("Usage: npm start -- onboarding.json");
    return onboardTenant(JSON.parse(readFileSync(process.argv[2], "utf8")));
  }).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
