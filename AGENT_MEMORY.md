# 🧠 QUANT ECOSYSTEM — MASTER ARCHITECTURE & MEMORY

> **System Status**: Fresh Baseline | Node.js 22 LTS | Next.js 15 | Fastify Microservices | Oracle Cloud (OCI) live, AWS retired  
> **Master Structure**: See [PROJECT_STRUCTURE.md](file:///c:/Users/Pc/Quant-Ecosystem/PROJECT_STRUCTURE.md) for complete 10-audit blueprint.  
> **Design Tokens**: See [UI_UX_SPEC.md](file:///c:/Users/Pc/Quant-Ecosystem/UI_UX_SPEC.md) for Obsidian luxury tokens.  
> **Roadmap**: See [MASTER_PLAN.md](file:///c:/Users/Pc/Quant-Ecosystem/MASTER_PLAN.md) for phase-by-phase plan, Definition of Done, and licensing policy.

---

## 🏛️ 1. ECOSYSTEM ARCHITECTURE & APPLICATIONS

### A. Unified Productivity Suite (`apps/quantmail` / `com.quant.mail`)
Combines 5 interconnected pillars under a unified Obsidian luxury shell with seamless SSO:
1. **QuantMail**: High-velocity email client (Superhuman-speed triage, keyboard shortcuts, docked composer, Schedule Send).
2. **QuantCalendar**: RFC 5545 recurrence, timezone math (IST/PDT dual clocks), public booking engine, meeting invites.
3. **QuantDrive**: Cloud storage with chunked multipart uploads, 15GB quota tracking, 8 active category cards (`Images`, `Videos`, `Audios`, `Documents`, `Archive`, `Tags`, `Others`, `Trash`).
4. **QuantGit (CodeHub)**: Real git tree explorer, commit/branch inspector, PR 3-way review diffs, actions streaming.
5. **QuantDex (Contacts)**: Sovereign address book with A-Z index, search, and vCard import/export.

### B. Dedicated Sovereign Applications
1. **QuantChat (`apps/quantchat` / `flutter_apps/apps/quant_chat`)**:
   - Signal Double Ratchet E2EE messaging, LiveKit WebRTC HD voice/video calls & audio stages.
   - 4-stage delivery ticks (clock/single/double/read), FastCDC chunked media streaming, ephemeral snaps with HTTP 410 tombstone destruction.
2. **QuantGram (`apps/quantgram` / `flutter_apps/apps/quant_gram`)**:
   - Instagram-class 9:16 vertical reels, 24h stories, AI context sheets, explore masonry grid, profile 4-tab matrix.
3. **QuantAI (`apps/quantai` / `flutter_apps/apps/quant_ai`)**:
   - ChatGPT / Claude Agent OS, dynamic tool calling, 3D Voice Orb, persistent conversation memory.
4. **QuanTube (`apps/quantube` / `flutter_apps/apps/quant_tube`)**:
   - YouTube + Spotify competitor: SponsorBlock segment skipping, floating PiP mini-player, background audio playback with spinning vinyl dock, and Creator Studio transcode pipeline.
5. **QuantCooks / QuantEdits (`apps/quantcooks` / `flutter_apps/apps/quant_cooks`)**:
   - CapCut / Runway-class AI video & motion editing platform with multi-track timeline, kinetic captions, and 4K ProRes FFmpeg export.
6. **QuantAds (`apps/quantads` / `flutter_apps/apps/quant_ads`)**:
   - Sovereign OpenRTB 3.0 ad exchange, dynamic creative optimization (DCO), and 70% creator rev-share instant payouts.

---

## 🌐 2. INFRASTRUCTURE & DEPLOYMENT TELEMETRY
- **Live**: Oracle Cloud (`ap-mumbai-1`), two Ampere A1 VMs inside the Always Free allowance: `vm-app` (1 OCPU / 8 GB, Docker Compose: Caddy, QuantMail, QuantChat, QuantAI, Redis) and `vm-db` (1 OCPU / 4 GB, PostgreSQL 15 + pgvector). The old AWS EKS staging is retired and the AWS account no longer exists. Map and rules: [`infra/oci/README.md`](infra/oci/README.md).
- **Public Domains**: `https://quantmail.in`, `https://quantai.quantrinity.in`, `https://quantchat.quantrinity.in` (Cloudflare proxy and edge TLS, Caddy on the VM).
- **CI/CD**: GitHub Actions: `deploy-oci.yml` (build, push to GHCR, SSH + `docker compose`), nightly restore-tested encrypted database backup plus an encrypted copy of the VM's `/etc/quant` (secrets, origin certificate, Caddyfile) (`db-backup.yml`), weekly housekeeping, and `ops-secrets-sync.yml`; all use the `oci-staging` environment. The AWS OIDC pipeline is dead.
- **Database & Storage**: PostgreSQL via Prisma ORM + Redis. Files belong in Cloudflare R2 (bucket map, variables and cut-over steps in [`docs/runbooks/r2-storage.md`](docs/runbooks/r2-storage.md)); until that cut-over Drive still uses the Oracle Object Storage bucket `quantmail-drive`.

---

## 📦 3. COMMERCIAL CODEBASE REFERENCE INVENTORY (`C:\Users\Pc\new`)
Source code for feature extraction, UI patterns, and backend models:
- **Chat & Realtime**: `Whoxa App v1.0.9`, `Whoxa Chat v1.1.2`, `Chatter`, `Chatzy`, `Grupo Chat`.
- **Media & Reels**: `Shortie`, `Shortzz`, `SnapReels`, `DTTube`, `DTLive`.
- **AI & Business**: `MagicAI`, `AgentLabs`, `Nexsas`, `ERPGo`.

---

## 🎨 4. DESIGN & STITCH MCP BRIDGE
- Master Design System: **Luxury Industrial Obsidian** (`#090A0E` canvas, `#111318` surface panels, `#FF7A00` high-contrast orange accent, Inter typography, 4px soft-geometric radius).
- **Stitch MCP Projects**:
  - `QuantMail & Ecosystem` (ID: `projects/12151411748119759863`): Desktop layout & 8 core screens.
  - `Quantmail Loading Screen Professional Variant` (ID: `projects/13022894794980791050`): Mobile loading UI.
- Detailed design tokens, screen mappings, and component guidelines are maintained in `UI_UX_SPEC.md`.
