# @quant/git-sshd

Standalone Git over SSH daemon listening on port 22 (or 2222 in container environments).

## Architecture

- **SSH Key Verification**: Authenticates incoming developer connections using SSH public keys stored in PostgreSQL `prisma.sshKey`.
- **Command Restrictor**: Enforces strict execution restriction; only allows `git-upload-pack 'owner/repo.git'` and `git-receive-pack 'owner/repo.git'`. Rejects interactive shell logins.
- **Direct Streaming**: Pipes I/O streams directly to the bare repository git engine on disk.
