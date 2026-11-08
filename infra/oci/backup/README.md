# infra/oci/backup

Nightly, encrypted, restore-tested backup of the production PostgreSQL database, plus an encrypted copy of the
VM's own config directory (`/etc/quant`), which is in neither the repository nor the database.

| File | What it does |
|---|---|
| `backup-db.sh` | Runs on vm-app (streamed over SSH). Dumps, restore-tests, encrypts, uploads and verifies by read-back; then does the same for `/etc/quant`; then prunes. |
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
- The database is not the only thing a lost VM would take with it. `/etc/quant` holds `secrets.env` (the Drive master key, the JWT and token secrets), the Cloudflare origin certificate and key, and the Caddyfile. About 10 KB in total. Without `DRIVE_MASTER_KEY` the stored Drive files cannot be decrypted, even with a perfect database restore. The directory is archived, encrypted to the same recipient and stored beside the dump. Files named `*.bak*` (the copies `sync-secrets.sh` leaves) are left out. The plaintext archive exists only in the script's private work directory, for seconds.
- The database copy is stored first. If the config copy then fails, the run turns red but the dump is already safe.

## Where backups go

Destination 1 is `BACKUP_S3_*` in `/etc/quant/secrets.env` when present, otherwise the Drive bucket under the private prefix `_ops/backups/` (no new credentials needed). Destination 2 is `BACKUP2_S3_*` when present: put a Cloudflare R2 bucket there to get an off-provider copy.

```
_ops/backups/pg/daily/qdb-<UTC time>-<8 hex of the plaintext sha256>.dump.age          35 days
_ops/backups/pg/monthly/...                                                              400 days
_ops/backups/vmconf/daily/qconf-<UTC time>-<8 hex of the plaintext sha256>.tar.age     35 days
_ops/backups/vmconf/monthly/...                                                          400 days
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

### The VM config (`/etc/quant`)

Restore this **before** starting the stack on a rebuilt VM: the database restore alone leaves the Drive files unreadable without `DRIVE_MASTER_KEY`.

```sh
rclone lsf --files-only <remote>:<bucket>/_ops/backups/vmconf/daily | sort | tail -n 1
rclone copyto <remote>:<bucket>/_ops/backups/vmconf/daily/<object> ./conf.tar.age
age -d -i backup-age.key -o conf.tar conf.tar.age
tar -tf conf.tar                  # quant/secrets.env, quant/certs/..., quant/caddy/Caddyfile
sudo tar -C /etc -xpf conf.tar    # recreates /etc/quant with its modes; as root, so owners come back too
sudo ls -l /etc/quant /etc/quant/certs /etc/quant/caddy
rm -f conf.tar                    # it holds every secret in plaintext
```

`secrets.env` should end up `root:opc`, mode `640`, and the certificate key `opc:opc`, mode `600`.

## Checking a backup without the VM

The run report is sealed for the ops key. Decrypt it with `infra/oci/ops/decrypt-report.mjs`. It lists the object name, plaintext and ciphertext checksums, tables compared and rows restored, then the config object (`config object:`, `CONF_OK`) with its file count.

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
- Store the database copy before the config copy, so a config problem never costs the dump.
- Report lines that the drill and the test read (`object:`, `plain sha256:`, `link-part`) keep their names. New output gets a new name; the config copy prints `config object:`.
- Change a pinned image or the `age` version only together with this file, and let `test-e2e.sh` pass.
