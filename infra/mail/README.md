# infra/mail: Stalwart lab as code

Phase 1 of the QuantMail engine plan: a small, isolated lab that runs [Stalwart](https://stalw.art)
(open source mail engine, AGPL-3.0) on the lab domain `lab.quantrinity.in`. Nothing here touches the real mail
domains (`quantmail.in`, the root of `quantrinity.in`).

```
infra/mail/
  .env.example            placeholders only; copy to stalwart/.env on the VM
  .gitignore              keeps local env files, OCI state and test output out of git
  stalwart/               what runs on the VM: compose file, config plans, provision.sh   (see stalwart/README.md)
  lab/                    laptop and VM tooling around it                                (see lab/README.md)
    create-lab.ps1        OCI: VCN, subnet, NSG (no port 22), Bastion, reserved IP, VM
    destroy-lab.ps1       removes only what create-lab.ps1 created
    dns-lab.ps1           Cloudflare records, lab.quantrinity.in only
    postgres-fixture.sql  Quant-style users table with argon2id hashes (SQL directory test)
    tests/                SMTP, JMAP, IMAP, GTUBE, hooks, load test
```

Rules this folder follows:

* The repository is public: no secrets, no private keys, no server IPs. Secrets live in `stalwart/.env` on the VM
  and in the container environment; OCIDs and the public IP live in `lab/.state/` and `lab/lab.config.local.json`
  (both git-ignored).
* No SSH from the internet. The OCI Bastion reaches `sshd` from inside the lab subnet.
* The Stalwart image is pinned by tag and digest. The engine is used unmodified.
