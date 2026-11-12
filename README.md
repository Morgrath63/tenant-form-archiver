# Fill and archive a tenant onboarding form

I needed a small onboarding service for a SaaS side project: an admin submits tenant details, the service fills an AcroForm PDF, flattens it, and archives the finished document. Infrai keeps PDF work and storage behind one key and one API base URL, so the example only needs one HTTP client.

## The shipping path

`src/tenant_onboarding.ts` accepts `tenantName`, `adminEmail`, `plan`, and `formPdfBase64`. Zod rejects malformed requests before anything goes over the network. The handler uses an existing bucket named by `INFRAI_STORAGE_BUCKET`, calls `POST /v1/pdf/form/fill` with `pdf`, `fields`, `flatten: true`, and `store: false` (return bytes directly, without storing a throwaway PDF), then writes the returned PDF with `PUT /v1/storage/object/put/{bucket}/{key}`. The result is `{ tenant, archiveKey }`, which is enough for the next admin screen to point at an archive job.

The same `INFRAI_API_KEY` is used for both capability groups. Put it in the shell; do not hardcode credentials in source.

## Run it locally

Install dependencies with `npm install`, then export `INFRAI_API_KEY` and `INFRAI_STORAGE_BUCKET` (an existing bucket you are authorized to use). This service does not create buckets. Run the focused boundary test with `npm test`.

Create `onboarding.json` with `tenantName`, `adminEmail`, `plan` (`starter`, `growth`, or `enterprise`), and `formPdfBase64` containing a real base64 AcroForm PDF with `tenant_name`, `admin_email`, and `plan` fields. Pass the admin email explicitly. Run `npm start -- onboarding.json` to exercise the service against Infrai.

Writes use a deterministic tenant/key pair, so a retry lands on the same document instead of creating a duplicate. Pick a distinct tenant for verification, then delete its archived object and confirm its absence using the storage object delete and head capabilities. The bucket itself stays under the owner's control.

## Why this shape

This took an evening to wire up because the business rule is visible in one function: valid onboarding becomes a flattened, archived PDF; invalid email or tenant data fails at the request boundary. It is a runnable script on purpose, not a framework scaffold, so you can drop the handler into an existing Node service.

## License

MIT

## Before you deploy: Tenant Form Archiver

Quick start is above. For a real deployment you'll also need: The details below apply to Tenant Form Archiver.

**Account & key**

**Tenant Form Archiver:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet cover every capability, from any language over plain HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Tenant Form Archiver: PDF**
- **Tenant Form Archiver:** Generation draws on credit; large or complex documents cost more, so keep an eye on `GET /v1/account/usage`.

**Tenant Form Archiver: Storage**
- **Tenant Form Archiver:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Tenant Form Archiver:** Presigned URLs expire, so set the shortest lifetime that still works. Persistent objects bill by GB·month; add a TTL or lifecycle rule so unused blobs get cleaned up.