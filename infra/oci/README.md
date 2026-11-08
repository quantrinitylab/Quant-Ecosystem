# Oracle Cloud (OCI) deployment

QuantMail, QuantAI and QuantChat run on two Ampere VMs in Oracle Cloud, region `ap-mumbai-1`, inside the Oracle
Always Free allowance. This page is the map: what runs where, how much of the free allowance is used, how to get
in, and where the detailed runbooks are. Facts below were read from the live tenancy on 2026-11-08.

## What runs where

| VM | Role | Shape | Disk | Notes |
| --- | --- | --- | --- | --- |
| `vm-app` | Docker Compose stack: Caddy, QuantMail (frontend + backend), QuantChat (frontend + backend), QuantAI (frontend + backend), Redis | A1.Flex, 1 OCPU, 8 GB | 100 GB boot volume | Public IP (ephemeral). Ports 80 and 443 only, behind Cloudflare. |
| `vm-db` | PostgreSQL 15 with pgvector, one container (`quant-postgres`) | A1.Flex, 1 OCPU, 4 GB | 47 GB boot volume | Postgres listens on the private address only. Data directory `/data/postgres` is on the boot volume. |
| `quantmail-lab-vm` | Mail lab (Stalwart), in the separate `quant-mail` compartment and VCN | E2.1.Micro, 1 OCPU, 1 GB | 50 GB boot volume | Reserved public IP, mail ports open, SSH only through the compartment's Bastion. |

The stack definition is [`compose/quant-stack.yml`](../../compose/quant-stack.yml); it is deployed by
[`deploy-oci.yml`](../../.github/workflows/deploy-oci.yml). Secrets live only on the VM in `/etc/quant/secrets.env`
(see [`secrets/README.md`](secrets/README.md) for how a reviewed set of them is changed).

## The free allowance, and how much of it is used

Oracle's Always Free compute is a monthly allowance of 1,500 OCPU-hours and 9,000 GB-hours on A1, which for one
instance running all month is **2 OCPUs and 12 GB**, plus two E2.1.Micro VMs and **200 GB** of block storage in
total (boot volumes count). See Oracle's [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

| Resource | Allowance | In use | Left |
| --- | --- | --- | --- |
| A1 OCPUs | 2 | 2 (`vm-app` 1, `vm-db` 1) | 0 |
| A1 memory | 12 GB | 12 GB (`vm-app` 8, `vm-db` 4) | 0 |
| Micro VMs | 2 | 1 (`quantmail-lab-vm`) | 1 |
| Block + boot storage | 200 GB | 197 GB (100 + 47 + 50) | 3 GB |

There is **no spare A1 capacity**. A third A1 VM, or a larger shape, is paid. Before adding anything, recompute this
table. Oracle also reclaims *idle* Always Free instances (a week of low CPU, network and, on A1, memory use), so a
VM that sits at near zero use is at some risk on a free-only account.

History: until 2026-11-08 the VMs were 4 OCPU / 24 GB and 2 OCPU / 12 GB with a 100 GB data volume, which was inside
the old allowance and the free trial's credits but not inside the current Always Free one. They were shrunk, and the
database moved off the data volume, before the trial ended (about 30 days after the tenancy was created on
2026-10-17). The data volume was deleted after a restore-tested backup of the moved database.

## Getting in

* **Day to day: the OCI Bastion service** (free). Create a *managed SSH* session for the VM, then SSH through it.
  No key has to be installed on the VM and the session expires on its own (default 3 hours).
  `oci bastion session create-managed-ssh --bastion-id <id> --target-resource-id <instance-ocid> --target-os-username opc --ssh-public-key-file <key.pub> --session-ttl 10800 --wait-for-state SUCCEEDED`
  The session id is in `oci bastion session list`; the work-request id the create call returns is *not* the session id.
* **Deploys and ops workflows:** GitHub Actions over SSH with the deploy key (`OCI_DEPLOY_SSH_KEY`, environment
  `oci-staging`). Port 22 is still open to the internet on `vm-app`; moving CI behind the Bastion or a tunnel and
  closing it is on the list.
* **OCI CLI:** a browser-login session (`oci session authenticate`) lasts at most an hour and can only be refreshed
  while still valid. For long unattended work use an API-key user with a narrow policy instead.
* **sshd** on both VMs has a drop-in, `/etc/ssh/sshd_config.d/00-quant-hardening.conf` (read first): no root login, no
  passwords, 3 attempts, 20 s login grace, no X11. `opc` with a key is the only way in. When editing `sshd_config` as
  `opc` remember it is root-only: use `sudo grep`, or a check that "finds nothing" will mislead you.
* **Run Command** (Cloud Agent) is enabled on the VMs but commands stayed in `ACCEPTED` and never ran on 2026-11-08.
  Do not rely on it until that is diagnosed.

## Rules learned the hard way

* A container with `restart: unless-stopped` that was stopped **by hand** stays stopped after a reboot. If you
  `docker stop` Postgres before changing a shape, `docker start` it afterwards.
* Changing an A1.Flex shape reboots the VM: about 2 minutes for the API call plus the boot. Expect about 3 minutes
  of downtime on `vm-app` and about 5 on `vm-db` if the database is stopped by hand.
* Moving data between volumes: mount the old one **read-only**, copy, verify by checksum, change `fstab` only after
  the copy is verified, and keep a rollback that remounts the old volume. `rsync -A -X` fails onto the root
  filesystem (SELinux attributes); `rsync -aH --numeric-ids` is enough for Postgres.
* In a bash script that has an `EXIT` trap, variables the trap uses must be globals, not `local` to `main`.
* Never `grep -v` inside a `set -o pipefail` pipeline without `|| true`: "nothing left" exits 1.

## Backups

* Nightly logical backup, encrypted to a public key, restore-tested on a throwaway container, uploaded and read
  back: [`backup/README.md`](backup/README.md), workflow `db-backup.yml` (20:17 UTC).
* Oracle's own boot-volume backups (policy `silver`) exist for both VMs. They count against the free backup
  allowance, so prune the manual `pre-change-*` ones a week after a change.
* Policy: no change that can lose data without a backup younger than 24 hours that has been verified.

## Object storage

Files live in Cloudflare R2, which has no egress fee, instead of Oracle Object Storage. The buckets and which
environment variables point at them are in [`../../docs/runbooks/r2-storage.md`](../../docs/runbooks/r2-storage.md).

## Other runbooks

* [`ops/README.md`](ops/README.md): diagnose, housekeeping, sealed reports.
* [`backup/README.md`](backup/README.md): backup, restore and the disaster-recovery drill.
* [`secrets/README.md`](secrets/README.md): changing the settings in `/etc/quant/secrets.env` without typing them on a server.
