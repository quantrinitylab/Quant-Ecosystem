# Task Directive: Build Public Marketing Portal in `apps/marketing`

## Objective

Initialize and construct the complete, production-ready marketing landing portal in `apps/marketing` for the Quant Ecosystem.

## Requirements

### 1. `apps/marketing/package.json`

```json
{
  "name": "@quant/marketing",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3010",
    "build": "next build",
    "start": "next start -p 3010",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "lucide-react": "^1.16.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.0"
  }
}
```

### 2. `apps/marketing/tsconfig.json`

Configure standard Next.js TypeScript config with `@/*` pointing to `./src/*`.

### 3. `apps/marketing/postcss.config.mjs` & `apps/marketing/tailwind.config.ts`

Tailwind config content scanning `./src/**/*.{js,ts,jsx,tsx}`, extending colors with Quant Studio design tokens:

- Background: `#0D1117`, card background: `#161B22`, border: `#30363D`, accent blue: `#58A6FF`, accent orange: `#FF8C42`, green: `#238636`.

### 4. `apps/marketing/src/app/globals.css`

Tailwind directives `@tailwind base; @tailwind components; @tailwind utilities;` plus dark theme body defaults (`bg-[#0D1117] text-[#E6EDF3]`).

### 5. `apps/marketing/src/app/layout.tsx`

Root layout with metadata:

- Title: "Quant Ecosystem — The Next NVIDIA of Software"
- Description: "One sovereign account unlocking Mail, Git, Social, AI, Video, and Chat with a single personal AI agent and unified Quant Credits."

### 6. `apps/marketing/src/app/page.tsx`

Rich, interactive landing page featuring:

1. **Header Navigation**:
   - Quant brand cursive wordmark (with gradient glow).
   - "Apps" dropdown menu showing the 10 core apps.
   - "Features", "Economy", "Download" nav links.
   - "Sign In" (linking to `http://localhost:3000/login`) and "Launch Workspace" CTA buttons.
2. **Hero Section**:
   - Headline: "The Sovereign AI Operating System"
   - Subtitle: "The Next NVIDIA of Software — 10 Killer Apps in 1 Identity, Controlled by Personal Agentic AI, Powered by Unified Quant Credits."
   - Dual CTAs: "Explore Apps" and "Download Client".
   - Live metrics bar: "2,409 Tests Passing", "Sub-5ms Local FTS5", "0% Creator Platform Fee".
3. **10-App Interactive Showcase Grid**:
   - Cards with icons, badges, and deep descriptions for:
     1. QuantMail (Super-Hub Email + Triage Lenses)
     2. QuantGit (Sovereign GitHub + Copilot Fleet + MCP Registry)
     3. QuantGram (9:16 Instagram Reels Killer + 0% Tip Payouts)
     4. QuantChat (WhatsApp + Telegram + LiveKit Meet SFU)
     5. QuantAI (Control Plane & Operating Agent)
     6. Quantube (YouTube + Music Streaming with AI Segment Skip)
     7. QuantWave (Twitter/X + Reddit killer with Verified Spaces)
     8. QuantMax (TikTok + Tinder Swipe Matching + Omegle Video)
     9. QuantAds (Second-Price Auction Monetization Engine)
     10. QuantTrinity (Executive Brain & Telemetry Control)
4. **Unified Quant Credits Economy Section**:
   - Card explaining $1 = 1 Credit, instant daily creator withdrawals via UPI/Stripe, zero middleman cut.
5. **Multi-Platform Downloads Section**:
   - Download cards for Web App, Android Jetpack Compose APK (`apk testing/`), Desktop client.
6. **Footer**:
   - Brand manifesto, ecosystem links, status indicator (`🟢 All Systems Operational`), copyright.

## Verification

Ensure all files exist in `apps/marketing/` and syntax is 100% valid TypeScript/React.
