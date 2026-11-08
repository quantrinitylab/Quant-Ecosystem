# infra/oci/backup

Nightly, encrypted, restore-tested backup of the production PostgreSQL database.

| File | What it does |
|---|---|
| `backup-db.sh` | Runs on vm-app (streamed over SSH). Dumps, restore-tests, encrypts, uploads, verifies by read-back, prunes. |
| `age-recipient.txt` | The PUBLIC age recipient every backup is encrypted to. Safe to publish. |
| `test-e2e.sh` | End-to-end test against throwaway local services. Runs in CI on every change here. |
| `../../../.github/workflows/db-backup.yml` | Nightly schedule (01:47 IST) and manual run. A red run emails the owner. |
| `../../../.github/workflows/db-backup-test.yml` | CI test for this folder. |

## Why this design

- The database is small (24 MB on 2026-11-07), so a logical dump takes seconds and a full restore test fits in every run.
- Nothing is installed on the host. The tools are containers pinned by digest (`postgres`, `pgvector`, `rclone`) and one static `age` binary pinned by SHA-256, placed in the deploy user's `~/.local/bin`.
- Public-key encryption (`age`). The VM and GitHub hold only the public recipient, so a stolen bucket, a leaked storage key or a compromised VM cannot read old backups. Only the holder of the private key can.
- Each run restores the fresh dump into a throwaway pgvector container, compares the row count of every table and demands an exact match for `_prisma_migrations`. A backup that cannot be restored fails the run.
- After upload the object is read back and its SHA-256 compared. Retention never prunes below 7 daily copies.

## Where backups go

Destination 1 is `BACKUP_S3_*` in `/etc/quant/secrets.env` when present, otherwise the Drive bucket under the private prefix `_ops/backups/pg/` (no new credentials needed). Destination 2 is `BACKUP2_S3_*` when present: put a Cloudflare R2 bucket there to get an off-provider copy.

```
_ops/backups/pg/daily/qdb-<UTC time>-<8 hex of the plaintext sha256>.dump.age     35 days
_ops/backups/pg/monthly/...                                                          400 days
```

Variables for a destination, with `<P>` = `BACKUP_S3` or `BACKUP2_S3`: `<P>_ENDPOINT`, `<P>_ACCESS_KEY_ID`, `<P>_SECRET_ACCESS_KEY`, `<P>_BUCKET`, `<P>_REGION` (use `auto` for R2), `<P>_FORCE_PATH_STYLE`.

## Keys

The private key is the only way to read a backup.

- It lives outside the repository and outside GitHub. If it is lost, every backup is unreadable. Keep two copies (a password manager and an offline copy).
- Public recipient: `age-recipient.txt`. To rotate, generate a new identity with `age-keygen`, replace the file, keep the old private key for old backups.

## Restore (disaster recovery)

You need the private key, `age`, and a way to reach the bucket.

```sh
# 1. fetch the newest object (any S3 tool; rclone shown)
rclone lsf --files-only <remote>:<bucket>/_ops/backups/pg/daily | sort | tail -n 1
rclone copyto <remote>:<bucket>/_ops/backups/pg/daily/<object> ./backup.dump.age

# 2. decrypt
age -d -i backup-age.key -o backup.dump backup.dump.age

# 3. restore into an empty database that has the extensions (vector, pg_trgm, pgcrypto)
createdb quantdb
pg_restore --no-owner --no-acl --exit-on-error -d quantdb backup.dump

# 4. create the application role, grant it the database, point DATABASE_URL at it, start the stack
```

Roles are not part of the dump (`--no-owner --no-acl`). The application uses one role; create it and grant it the database before starting the app.

## Checking a backup without the VM

The run report is sealed for the ops key. Decrypt it with `infra/oci/ops/decrypt-report.mjs`. It lists the object name, plaintext and ciphertext checksums, tables compared and rows restored.

## Disaster-recovery drill (do it after any change here, and at least once a quarter)

Run **DB backup** by hand and set `presign_minutes` to 15. The sealed report then also carries a read link for the new object, printed in 24-character `link-part` lines (the report scrubber masks any run of 32 or more token characters, which would destroy the signature in a one-line link). Join the parts without spaces and download within 15 minutes, then prove the whole chain with the private key:

```sh
age -d -i backup-age.key -o backup.dump qdb-<...>.dump.age
sha256sum backup.dump                 # must equal the "plain sha256" line in the report
head -c 5 backup.dump                 # PGDMP
pg_restore --list backup.dump | head  # a readable table of contents
```

## Rules for changing the script

- Print names, sizes, counts and durations only. Never a secret or a connection string.
- No secret on a command line: containers receive them as `-e NAME` from the environment, and `sh -c` expands them inside the container.
- Keep the body in `main()` with stdin from `/dev/null`; any failure must exit non-zero.
- Change a pinned image or the `age` version only together with this file, and let `test-e2e.sh` pass.
