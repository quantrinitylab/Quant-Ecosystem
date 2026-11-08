# infra/oci/secrets

How a short, reviewed list of settings gets from GitHub into `/etc/quant/secrets.env` on `vm-app` without anyone
typing a key on a server, pasting it into a chat, or giving the deploy workflow a way to read the VM's secrets.

| File | What it does |
| --- | --- |
| `sync-secrets.sh` | Runs on the VM. Reads `NAME=value` lines from a 0600 file, accepts only allowlisted names whose values match a strict format, backs up the old file, swaps the new one in atomically. Never prints a value. Optionally recreates containers. |
| `test-sync-secrets.sh` | Tests of the above against a temp file: allowlist, formats, injection attempts, idempotence, duplicate lines, backup cap, no value in output. Run by `.github/workflows/db-backup-test.yml`. |
| `../../../.github/workflows/ops-secrets-sync.yml` | The only caller. Builds the pairs from the GitHub environment `oci-staging`, sends them over SSH, prints a sealed report. |

## Use it

1. In GitHub: **Settings, Environments, oci-staging**. Add the *secret* or *variable* (names below).
   Keys and passwords are **secrets**; bucket names, endpoints and account ids are **variables**.
2. **Actions, Ops secrets sync, Run workflow**, branch `main`. Choose `restart=backends` if the running backends must
   read the change now (they are recreated on the image tag that is already running, nothing else changes).
3. The job log holds one sealed block. Decrypt it with `infra/oci/ops/decrypt-report.mjs` and the ops key, as for the
   other ops workflows. It lists each name as `added`, `updated` or `unchanged` with the value length, never a value.

## What can travel through it

| Name | Kind | Format enforced on the VM |
| --- | --- | --- |
| `CLOUDFLARE_R2_ACCOUNT_ID` | variable | 32 lowercase hex |
| `DRIVE_R2_BUCKET`, `ATTACHMENTS_BUCKET` | variable | bucket name |
| `R2_ACCESS_KEY_ID` | secret | 16 to 64 letters or digits |
| `R2_SECRET_ACCESS_KEY` | secret | 32 to 128 letters or digits |
| `BACKUP_S3_ENDPOINT`, `BACKUP2_S3_ENDPOINT` | variable | `https://` host |
| `BACKUP_S3_BUCKET`, `BACKUP2_S3_BUCKET` | variable | bucket name |
| `BACKUP_S3_REGION`, `BACKUP2_S3_REGION` | variable | lowercase letters, digits, dashes (R2 uses `auto`) |
| `BACKUP_S3_FORCE_PATH_STYLE`, `BACKUP2_S3_FORCE_PATH_STYLE` | variable | `true` or `false` |
| `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP2_S3_ACCESS_KEY_ID` | secret | 16 to 64 letters or digits |
| `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP2_S3_SECRET_ACCESS_KEY` | secret | key material |

`BACKUP_S3_*` and `BACKUP2_S3_*` are read by `infra/oci/backup/backup-db.sh` (destination 1 and destination 2).
The app and the backup job get **separate** R2 tokens on purpose: a leaked app token must not be able to delete backups.

## Adding a name

Three places, in one reviewed change: the `RULE` table in `sync-secrets.sh` (with a format as tight as the value
allows), the `env:` block and the loop in `ops-secrets-sync.yml`, and a case in `test-sync-secrets.sh`.

## What it will not do

It never deletes a line. Removing a setting (for example the old `DRIVE_S3_*` after Drive moved to R2) is a
deliberate manual step on the VM, after a backup copy of the file: `sudo cp -p /etc/quant/secrets.env /etc/quant/secrets.env.bak-$(date -u +%Y%m%dT%H%M%SZ)`.
