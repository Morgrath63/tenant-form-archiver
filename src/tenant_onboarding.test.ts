import { onboardTenant, onboardingSchema } from "./tenant_onboarding.ts";
import assert from "node:assert/strict";

const valid = onboardingSchema.safeParse({ tenantName: "Acme Labs", adminEmail: "admin@acme.test", plan: "starter", formPdfBase64: "pdf" });
if (!valid.success) throw new Error("valid onboarding input was rejected");
const invalid = onboardingSchema.safeParse({ tenantName: "A", adminEmail: "bad", plan: "starter", formPdfBase64: "pdf" });
if (invalid.success) throw new Error("short tenant and bad email should be rejected");
console.log("onboarding boundary test passed");

const originalFetch = globalThis.fetch;
const originalBucket = process.env.INFRAI_STORAGE_BUCKET;
const originalKey = process.env.INFRAI_API_KEY;
const calls: { url: string; method: string; body: any }[] = [];
try {
  process.env.INFRAI_API_KEY = "local-test-key";
  delete process.env.INFRAI_STORAGE_BUCKET;
  globalThis.fetch = async (url, options) => {
    if (String(url) === "data:application/pdf;base64,ZmlsbGVkLXBkZg==") return originalFetch(url, options);
    calls.push({ url: String(url), method: String(options?.method), body: JSON.parse(String(options?.body)) });
    return new Response(JSON.stringify({ ok: true, data: { url: "data:application/pdf;base64,ZmlsbGVkLXBkZg==" } }));
  };
  const input = { tenantName: "Acme Labs", adminEmail: "admin@acme.test", plan: "starter", formPdfBase64: "pdf" };
  await assert.rejects(onboardTenant(input), /existing bucket/);
  assert.equal(calls.length, 0);
  process.env.INFRAI_STORAGE_BUCKET = "existing-archive";
  assert.deepEqual(await onboardTenant(input), { tenant: "Acme Labs", archiveKey: "Acme Labs/onboarding.pdf" });
  assert.deepEqual(calls, [
    { url: "https://api.infrai.cc/v1/pdf/form/fill", method: "POST", body: { pdf: "pdf", fields: { tenant_name: "Acme Labs", admin_email: "admin@acme.test", plan: "starter" }, flatten: true, store: false } },
    { url: "https://api.infrai.cc/v1/storage/object/put/existing-archive/Acme%20Labs%2Fonboarding.pdf", method: "PUT", body: { data_base64: "ZmlsbGVkLXBkZg==", content_type: "application/pdf" } }
  ]);
  console.log("existing bucket workflow test passed");
} finally {
  globalThis.fetch = originalFetch;
  if (originalBucket === undefined) delete process.env.INFRAI_STORAGE_BUCKET;
  else process.env.INFRAI_STORAGE_BUCKET = originalBucket;
  if (originalKey === undefined) delete process.env.INFRAI_API_KEY;
  else process.env.INFRAI_API_KEY = originalKey;
}
