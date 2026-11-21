# lab/: provisioning, DNS and tests

PowerShell scripts run on the Windows laptop (Windows PowerShell 5.1, OCI CLI profile `MAIL`). Bash scripts run on
the VM. Nothing here needs Docker on the laptop.

## Scripts

| Script | Where | What |
|---|---|---|
| `create-lab.ps1` | laptop | Idempotent OCI setup: VCN 10.20.0.0/16, public subnet, internet gateway, route table, a security list without internet SSH, NSG (25/80/443 and 465/587/993 from anywhere), Bastion, reserved public IP, one VM with cloud-init. `-DryRun` only checks the limits. |
| `destroy-lab.ps1` | laptop | Deletes the objects recorded in `.state/lab-state.json` that still carry the tag `quant-lab=stalwart-lab`. Asks for a confirmation phrase. |
| `dns-lab.ps1` | laptop | Cloudflare API (`CLOUDFLARE_DNS_TOKEN`): A `mail.lab`, MX, SPF, DMARC `p=none`, DKIM TXT from Stalwart's zone file. Refuses any name outside `lab.quantrinity.in`; updates only records it created. `-DryRun`, `-Remove`. |
| `seed-sql-directory.sh` | VM | Loads `postgres-fixture.sql` into the throw-away Postgres with argon2id hashes. |
| `cloud-init.yaml` | VM (first boot) | Docker CE + compose plugin, swap on 1 GB shapes, OS firewall for the mail ports only, sparse checkout of `infra/mail` from the public repo. |
| `tests/` | laptop or VM | See below. |

### Shape choice and cost

`create-lab.ps1` reads the tenancy limits first. It prefers the Always Free `VM.Standard.E2.1.Micro` (1 GB RAM,
USD 0, enough for a lab; the VM gets 2 GB swap) and falls back to `VM.Standard.A1.Flex` with 1 OCPU / 6 GB
(about USD 14 per month if billed, USD 0 inside the Always Free A1 allowance). Boot volume 50 GB. Cap: USD 20 per month.
It tries every candidate shape and availability domain (Always Free shapes often report "out of host capacity").

### Local config

Copy `lab.config.example.json` to `lab.config.local.json` (git-ignored) and fill in the OCID of the compartment
`quant-mail` and your SSH public key path. The script writes all created OCIDs and the reserved IP to
`.state/lab-state.json` (git-ignored). Nothing is hard-coded.

## Tests (`tests/`)

Node 18+ and `curl`; no npm packages. Environment (see `../.env.example`): `TEST_HOST`, `TEST_ALICE`, `TEST_BOB`,
`TEST_ALICE_PASSWORD`, `TEST_BOB_PASSWORD`, optional `TEST_INSECURE=1` before ACME has issued a certificate.

| File | Covers |
|---|---|
| `smtp-submit.mjs` | T2: submission on 587 with STARTTLS and AUTH, delivery alice -> bob (checked via JMAP), no relay without AUTH |
| `smtp-inbound.mjs [rcpt]` | T3 helper and T11: act as an external sender on port 25, unknown recipient rejected at RCPT, no open relay |
| `imap-check.sh` / `imap-check.ps1` | T6: login and fetch with `curl imaps://` |
| `jmap-suite.mjs` | T7: discovery, session, Mailbox/get, Email/query+get, Email/set (keywords, move), Thread/get, EmailSubmission with HOLDUNTIL and cancel, blob upload/download, EventSource push |
| `gtube.mjs` | T10: GTUBE message is classified as spam |
| `hook-receiver.mjs` | T9: webhook receiver and MTA Hook stub (runs as the `hooks` compose service); payloads go to `captured/*.jsonl` |
| `load-test.mjs [n] [conns]` | T13: 2,000 messages over parallel submissions, then waits for delivery |
| `resource-snapshot.sh` | T13: RAM, CPU, disk and container stats |
| `run-all.sh` | runs the above in order (`LOAD=1` adds the load test) |

`hook-receiver.mjs` can also run on its own: `HOOK_PORT=9000 node tests/hook-receiver.mjs`.
