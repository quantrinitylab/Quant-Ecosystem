# Marketplace Distribution

Package delivery uses signed immutable artifacts.

Requirements:
- provenance
- checksum
- signature
- version
- compatible platform/client
- revocation status

Clients verify package integrity before activation.

Distribution outage must not corrupt already-installed package metadata or authorization state.
