# infra/oci/ops

Operator tooling for the live Oracle Cloud VMs. Everything in this folder is read-only unless a file says otherwise in its own header.

| File | What it does |
|---|---|
| `diagnose-vm-app.sh` | Read-only report on vm-app: host and Oracle shape, containers, Redis and BullMQ queue depths, outbound reachability (including TCP 25), mail and storage variable names, disk hygiene, deploy state, 24-hour log counters, database aggregates. |
| `scrub-output.mjs` | Filter between `ssh` and the file. Masks e-mail addresses, credentials inside URLs and long token-like strings. |
| `encrypt-report.mjs`, `report-public-key.pem` | Seals the scrubbed report for the ops key before anything is printed. |
| `decrypt-report.mjs` | Reads the sealed block (a raw file or a downloaded job log). Needs the private key, which is never in this repository. |
| `../../../.github/workflows/ops-diagnose.yml` | Runs the files above over SSH with the existing deploy key. |

## Run it

GitHub, Actions, **Ops diagnose (read-only vm-app report)**, Run workflow, branch `main`. The job log holds one encrypted block. To read it, download the job log and run:

```sh
node infra/oci/ops/decrypt-report.mjs <private-key.pem> <job-log.txt>
```

Untick `include_db_counts` to skip the database part. The workflow refuses to run from any other branch, so a branch cannot swap in a different script and run it with the deploy key.

## Why the report is encrypted

This repository and its Actions logs are public. The report lists container tags, open ports, row counts and the names of secret variables. That is what an operator needs and also a map for an attacker, so the public log shows only ciphertext. The private key is held by the owner's machine, outside the repository and outside GitHub. To rotate it, generate a new RSA key pair, replace `report-public-key.pem`, and keep the old private key for old logs.

## Rules for changing the script

- Print names, counts, dates and yes/no flags only. Never print a secret value, a connection string, an e-mail address or a user IP address. The encryption is a second layer, not a licence to print more.
- Change nothing on the VM: no restart, no write, no package install. The database session is read-only at the server (`default_transaction_read_only=on`).
- Keep the whole body inside `main()` and call it with stdin from `/dev/null`. The script arrives on the SSH pipe, and any command that reads stdin would swallow the rest of it.
- Keep the SQL in step with `packages/database/prisma/schema.prisma`. A failed statement prints an error and the rest still runs.
