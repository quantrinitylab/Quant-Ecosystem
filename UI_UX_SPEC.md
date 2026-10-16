# 🎨 QUANT ECOSYSTEM — UI/UX MASTER ARCHITECTURE & SPECIFICATION

> **Design Direction**: Luxury Industrial Obsidian  
> **Target Experience**: Faster than Superhuman, cleaner than Linear, more fluid than Apple.

---

## 💎 1. DESIGN PHILOSOPHY & PALETTE

The Quant design language is engineered for high-velocity information processing and extreme focus. It combines a cold, precise technical aesthetic with warm, high-contrast tactical accents.

### Core Color System
| Role | Hex | Tailwind Token | Usage |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#090A0E` | `bg-obsidian-950` | Base background for entire viewport, highest contrast |
| **Surface Level 1** | `#111318` | `bg-obsidian-900` | Docked modules, thread lists, sidebar navigation |
| **Surface Level 2** | `#161B22` | `bg-obsidian-850` | Hover states, active cards, modal overlays |
| **Surface Level 3** | `#1F242C` | `bg-obsidian-800` | Popovers, dropdown menus, floating toolbars |
| **Border / Gutter** | `#283042` | `border-obsidian-700` | 1px crisp structural divider lines |
| **Primary Accent** | `#FF7A00` | `text-quant-orange` | High-priority actions, active tabs, unread indicators |
| **Accent Glow** | `rgba(255,122,0,0.15)` | `glow-quant` | Subtle focus rings and selection halos |
| **Text High-Contrast** | `#F2F4F7` | `text-slate-100` | Primary headers, active thread subjects |
| **Text Medium** | `#94A3B8` | `text-slate-400` | Body copy, secondary metadata, preview text |
| **Text Muted** | `#64748B` | `text-slate-500` | Timestamps, inactive labels, keyboard shortcut text |

---

## 📐 2. LAYOUT & SHELL ARCHITECTURE

### Edge-to-Edge Single-Header Layout
```
+-----------------------------------------------------------------------------------+
|  [Logo] QuantMail  |  [Q Mail v]   [ 🔍 Search or Cmd+K... ]   [AI] [🔔] [Avatar] |  <- 52px Unified TopBar
+-----------------------------------------------------------------------------------+
|  Nav Icons (48px)  |  Thread / Item List (320px)  |  Reading / Content Stage (Flex) |
|                    |                              |                                 |
|  - Mail            |  - Unread (2px Orange bar)   |  - Full header & subject line   |
|  - Calendar        |  - Thread item 1             |  - Rich message / doc body      |
|  - Drive           |  - Thread item 2             |  - Docked Reply Composer        |
|  - QuantGit        |                              |                                 |
|  - Contacts        |                              |                                 |
+-----------------------------------------------------------------------------------+
```

### Key Layout Principles:
1. **Unified 52px Top Header**: Consolidate multiple stacked header rows into a single, cohesive 52px top bar on desktop.
2. **Zero Redundant Sidebars**: Eradicate `DesktopContextSidebar` to give 100% of the screen width to the user's primary content.
3. **Buttery-Smooth 60fps Motion**: Remove artificial delays (such as 380ms transition freezes) and avoid global DOM queries on scroll.
4. **IDEs / Power-User Density**: 4px soft-geometric border radii, tight 8px list item paddings, and explicit monospace keyboard shortcut badges (`KBD`).

---

## 🧵 3. STITCH MCP DESIGN BRIDGE

Stitch is integrated as the primary AI UI/UX design studio for screen generation, variants, and design system synchronization.

### Active Stitch Projects:
1. **`QuantMail & Ecosystem`** (`projects/12151411748119759863`):
   - **Origin**: STITCH / Desktop / Dark Mode
   - **Screens Available**:
     - `06f53a71452d4043a4d9eb99fb851e79`: Mobile Thread View (390x884)
     - `4c31682f19a94068b03bacd698d5bbc1`: Desktop 3-Pane Mail Stage (1280x1024)
     - `5dbce8f9f8564ce98d775a10e9928edd`: Calendar & Scheduling Grid (1280x1024)
     - `7abaa12ae751495399b564f921657954`: Mobile Nav & Quick Compose (390x884)
     - `a9d38d597e0443c19458270f8d5452bc`: Iconography & Asset Canvas (512x512)
     - `d46c3f3c981c48e78e50e6d69386256e`: Drive & File Browser Stage (1420x1024)
     - `f0cc72df6c5f4fb49886511c69afab27`: Quick Action Sheet (390x435)

2. **`Quantmail Loading Screen Professional Variant`** (`projects/13022894794980791050`):
   - **Origin**: STITCH / Mobile
   - Mobile splash & authentication loading variants.

### Stitch MCP Tooling Workflow:
- **`generate_screen_from_text`**: Generate brand new high-fidelity screens from prompt descriptions.
- **`generate_variants`**: Create multiple layout and color variations of an existing screen.
- **`edit_screens`**: Apply surgical changes to existing screens based on feedback.
- **`create_design_system_from_design_md`**: Keep token rules synchronized between code and Stitch canvas.

---

## 📱 4. SCREEN MATRIX ACROSS ALL 10 APPS

| App | Key Screens to Design / Polish | Target Benchmark |
| :--- | :--- | :--- |
| **QuantMail** | Split Inbox, Docked Composer, Schedule Send, Attachment Engine | Superhuman / Spark |
| **QuantCalendar** | Day/Week/Month Grid, Dual IST/PDT Clock, Public Booking Page | Google Calendar / Cron / Calendly |
| **QuantDrive** | 8 Category Cards, File Grid/List, Storage Quota Gauge, Preview Sheet | Dropbox / Google Drive |
| **QuantGit** | Tree Explorer, Commit Graph, Side-by-Side PR Review, Actions Stream | GitHub / Linear |
| **QuantDex** | A-Z Contacts Rail, Card View, Interaction History, Export Modal | Apple Contacts / Folk |
| **QuantChat** | Chat Bubble Feed, Audio Waveform Recorder, Ephemeral Snap Sheet | WhatsApp / Signal |
| **QuantGram** | 9:16 Fullscreen Reel, About Reel Context Sheet, Profile 4-Tab Matrix | Instagram / TikTok |
| **QuantAI** | 3D Voice Orb Stage, Canvas Mode Split, Tool Calling Output Cards | ChatGPT / Claude Artifacts |
| **QuanTube** | Video Player with SponsorBlock, Audio Dock with Spinning Vinyl | YouTube / Spotify |
| **QuantCooks** | Multi-Track Timeline, Keyframe Editor, Kinetic Caption Previewer | CapCut / Runway |
