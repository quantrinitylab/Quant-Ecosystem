# Object storage on Cloudflare R2

All user files and large blobs go to Cloudflare R2 (S3-compatible, no egress fee, the first 10 GB a month free,
see [R2 pricing](https://developers.cloudflare.com/r2/pricing/)), not to Oracle Object Storage. This page is the map from bucket to code to environment variable, and the steps to switch a
running stack over. Bucket names and settings were read from the live Cloudflare account on 2026-11-08.

## Buckets

| Bucket | Location | Used for | Public access |
| --- | --- | --- | --- |
| `quantmail-drive` | APAC | QuantMail Drive files. The app envelope-encrypts every file (`DRIVE_MASTER_KEY`) before it is stored. | none |
| `quantmail-mailblobs` | APAC | Everything that goes through the shared `@quant/storage` client: mail attachments, collaborative-document state, large Drive uploads, QuantChat media. | none |
| `quant-backups` | APAC | Second copy of the nightly encrypted database dump. | none; add a bucket lock (below) |
| `quantube-media-production` | ENAM | Public media, served as `https://media.quantmail.in`. Not used by the OCI stack. | custom domain |
| `quant-chat-media-production`, `quant-edits-media-production`, `quant-neon-media-production`, `quant-media-staging`, `quantrinity` | ENAM / APAC | Other apps and staging. Not wired on the OCI VMs. | none |

Every bucket has only Cloudflare's default rule (abort unfinished multipart uploads after 7 days); nothing expires
objects. CORS is not configured on any bucket yet.

## What the code reads

Two resolvers, deliberately compatible. Names are checked in this order and the first one set wins.

**Drive, small and normal uploads** (`apps/quantmail/backend/services/drive-storage.service.ts`):

| Setting | Variables, first match wins |
| --- | --- |
| Bucket | `DRIVE_S3_BUCKET`, `DRIVE_R2_BUCKET`, `R2_BUCKET`, `S3_BUCKET` |
| Endpoint | `DRIVE_S3_ENDPOINT`, then `DRIVE_R2_ENDPOINT`, `CLOUDFLARE_R2_ENDPOINT`, `R2_ENDPOINT`, or derived from `CLOUDFLARE_R2_ACCOUNT_ID`, then `S3_ENDPOINT` |
| Access key / secret | `DRIVE_S3_*`, `DRIVE_R2_*`, `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, `S3_*`, `AWS_*` |
| Region | the literal `auto` whenever the endpoint host ends in `r2.cloudflarestorage.com` |

**Everything else** (`packages/storage/src/storage-config.ts`, used by attachments, collaborative documents, chat and
Drive's large uploads): bucket `ATTACHMENTS_BUCKET`, then `R2_BUCKET`, then `S3_BUCKET`; endpoint from
`CLOUDFLARE_R2_ENDPOINT`, `R2_ENDPOINT` or `CLOUDFLARE_R2_ACCOUNT_ID`; keys `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.

Because the legacy `DRIVE_S3_*` names win, **the old Oracle settings must be removed from `/etc/quant/secrets.env`
for Drive to move**; setting the R2 names next to them changes nothing.

Target values on the VM:

```
CLOUDFLARE_R2_ACCOUNT_ID=<32 hex, from the Cloudflare dashboard>
R2_ACCESS_KEY_ID=<app token>           R2_SECRET_ACCESS_KEY=<app token>
DRIVE_R2_BUCKET=quantmail-drive
ATTACHMENTS_BUCKET=quantmail-mailblobs
```

and for the backup job (a separate token, see below): `BACKUP_S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`,
`BACKUP_S3_BUCKET=quant-backups`, `BACKUP_S3_REGION=auto`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`.
The existing Oracle backup bucket stays as destination 2 under `BACKUP2_S3_*`.

## Create the tokens (dashboard, once)

R2 S3 credentials come only from the dashboard (or an API token with account-token write rights, which we do not grant).
Cloudflare dashboard, **R2 object storage**, **Manage** next to *API Tokens*, **Create Account API token**
([Cloudflare docs](https://developers.cloudflare.com/r2/api/tokens/)):

1. `quant-app`: permission **Object Read & Write**, buckets `quantmail-drive` and `quantmail-mailblobs`.
2. `quant-backup`: permission **Object Read & Write**, bucket `quant-backups` only.

Each shows an Access Key ID and a Secret Access Key **once**. Put them straight into the GitHub environment
`oci-staging` as secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKUP_S3_ACCESS_KEY_ID`,
`BACKUP_S3_SECRET_ACCESS_KEY`, plus the variables listed in [`infra/oci/secrets/README.md`](../../infra/oci/secrets/README.md),
then run the *Ops secrets sync* workflow. Two tokens, because a leaked app token must not be able to delete backups.

## Cut Drive over (in this order)

1. Take and verify a database backup (`db-backup.yml`). Note the number of Drive objects in the old bucket.
2. Run *Ops secrets sync* with `restart=none` so the R2 names are in the file but nothing changes yet.
3. Copy the existing objects with a pinned `rclone` from the old bucket to `quantmail-drive`; compare counts and sizes.
4. Back up `/etc/quant/secrets.env`, remove the `DRIVE_S3_*` lines, recreate the three backends.
5. Prove it from the running container: put, get and delete one small object under `_ops/selftest/` through the same code path.
6. Keep the old bucket read-only for a week, then empty and delete it.

If step 5 fails, restore the file copy from step 4 and recreate the backends: Drive is back on the old bucket.

## Backups bucket: make deletion hard

Put a *bucket lock* on `quant-backups` (rule: all objects, age 14 days). A stolen token can then add objects but not
delete or overwrite anything younger than two weeks. The backup job prunes only copies older than 35 days.

## Known gaps

* **Large Drive uploads (multipart) cannot be downloaded.** `POST /drive/upload/multipart/:id/complete` stores the row with
  empty `encryptionIV`, `encryptionAuthTag` and `encryptionKey`, and `GET /drive/files/:id/download` always runs
  `checkedPlaintext`, which throws `Corrupt key envelope` for such rows. The upload also goes through the shared
  resolver (`ATTACHMENTS_BUCKET`) while the download reads the Drive bucket. Nothing under `apps/quantmail/src` calls
  the multipart routes today, so users cannot reach this, but the API would accept such an upload as soon as shared
  storage is configured and then could not return it. Fix the download side, and route every Drive byte through one
  bucket, before the UI uses it.
* The browser uploads multipart parts straight to R2 with presigned URLs, which needs CORS on that bucket
  (`PUT`, `ETag` exposed, origin `https://quantmail.in`). Not configured.
