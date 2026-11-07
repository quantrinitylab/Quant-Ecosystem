# infra/oci/ops

Operator tooling for the live Oracle Cloud VMs. Everything in this folder is read-only unless a file says otherwise in its own header.

| File | What it does |
|---|---|
| `diagnose-vm-app.sh` | Read-only report on vm-app: host and Oracle shape, containers, Redis and BullMQ queue depths, outbound reachability (including TCP 25), mail and storage variable names, deploy state, 24-hour log counters, database aggregates. |
| `scrub-output.mjs` | Filter between `ssh` and the log. Masks e-mail addresses, credentials inside URLs and long token-like strings. |
| `../../../.github/workflows/ops-diagnose.yml` | Runs the two files above over SSH with the existing deploy key. |

## Run it

GitHub, Actions, **Ops diagnose (read-only vm-app report)**, Run workflow, branch `main`. The report appears in the job log and in the run summary. Untick `include_db_counts` to skip the database part.

The workflow refuses to run from any other branch, so a branch cannot swap in a different script and run it with the deploy key.

## Rules for changing the script

- This repository and its Actions logs are public. Print names, counts, dates and yes/no flags only. Never print a secret value, a connection string, an e-mail address or a user IP address.
- Change nothing on the VM: no restart, no write, no package install. The database session is read-only at the server (`default_transaction_read_only=on`).
- Keep the whole body inside `main()` and call it with stdin from `/dev/null`. The script arrives on the SSH pipe, and any command that reads stdin would swallow the rest of it.
- Keep the SQL in step with `packages/database/prisma/schema.prisma`. A failed statement prints an error and the rest still runs.
