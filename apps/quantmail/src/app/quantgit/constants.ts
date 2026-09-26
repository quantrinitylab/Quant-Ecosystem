import type {
  Repo,
  FileNode,
  IssueItem,
  PRItem,
  DiscussionItem,
  WorkflowRunItem,
  ProjectCard,
  SecurityAlert,
  DeployedAgent,
  CommitItem,
  BranchItem,
} from './types';

// Initial Mock Repositories
export const INITIAL_REPOS: Repo[] = [
  {
    id: 'quant-ecosystem',
    name: 'Quant-Ecosystem',
    fullName: 'Quant-Ecosystem',
    description: 'Next-gen sovereign workspace, autonomous AI swarm, Git hub & Android client.',
    visibility: 'public',
    language: 'TypeScript',
    stars: 128,
    forks: 24,
    watching: 12,
    cloneUrl: 'https://quantmail.in/quantgit/Quant-Ecosystem.git',
    sshUrl: 'git@quantmail.in:Quant-Ecosystem.git',
    defaultBranch: 'main',
    latestCommit:
      'feat(quantgit): restore 4 bottom deck tabs, repos overview & publish android testing apk',
    latestCommitSha: 'ac612198',
    latestCommitTime: '1 hour ago',
    checksStatus: 'passing',
    license: 'MIT License',
    website: 'https://quantmail.in',
    topics: [
      'email',
      'sovereign-os',
      'agentic-ai',
      'git-smart-http',
      'monorepo',
      'jetpack-compose',
    ],
    branchCount: 348,
    commitCount: 2118,
    branches: ['main', 'feat/sprint-7-github-parity', 'fix/core-astra-audit', 'release/v1.0.0-apk'],
  },
  {
    id: 'quantmail-core',
    name: 'quantmail-core',
    fullName: 'quantmail-core',
    description:
      'Ultra-fast sovereign mail client with inline triage lenses & local ONNX semantic search.',
    visibility: 'private',
    language: 'TypeScript',
    stars: 42,
    forks: 5,
    watching: 8,
    cloneUrl: 'https://quantmail.in/quantgit/quantmail-core.git',
    sshUrl: 'git@quantmail.in:quantmail-core.git',
    defaultBranch: 'main',
    latestCommit: 'refactor(core): unify Bayesian spam classifier with isolated tenant indexes',
    latestCommitSha: '7f9104b2',
    latestCommitTime: '12 hours ago',
    checksStatus: 'passing',
    license: 'Proprietary',
    website: 'https://quantmail.in',
    topics: ['email', 'privacy', 'onnx', 'rust-worker'],
    branchCount: 42,
    commitCount: 846,
    branches: ['main', 'feat/offline-sync', 'fix/ses-deliverability'],
  },
  {
    id: 'quantchat-meet',
    name: 'quantchat-meet',
    fullName: 'quantchat-meet',
    description: 'LiveKit WebRTC gateway, SFU, voice AI agent, and calendar proactive alerts.',
    visibility: 'private',
    language: 'TypeScript',
    stars: 35,
    forks: 3,
    watching: 4,
    cloneUrl: 'https://quantmail.in/quantgit/quantchat-meet.git',
    sshUrl: 'git@quantmail.in:quantchat-meet.git',
    defaultBranch: 'main',
    latestCommit: 'feat(webrtc): LiveKit SFU cluster resilience and proactive voice call dispatch',
    latestCommitSha: '4fcec52e',
    latestCommitTime: 'yesterday',
    checksStatus: 'passing',
    license: 'Proprietary',
    website: 'https://quantmail.in',
    topics: ['webrtc', 'livekit', 'voice-ai', 'messaging'],
    branchCount: 28,
    commitCount: 512,
    branches: ['main', 'feat/livekit-sfu', 'feat/voice-bot'],
  },
  {
    id: 'quant-mobile-android',
    name: 'quant-mobile-android',
    fullName: 'quant-mobile-android',
    description:
      'Native Jetpack Compose Android client with hardware-accelerated WebView and offline resilience.',
    visibility: 'public',
    language: 'Kotlin',
    stars: 89,
    forks: 14,
    watching: 19,
    cloneUrl: 'https://quantmail.in/quantgit/quant-mobile-android.git',
    sshUrl: 'git@quantmail.in:quant-mobile-android.git',
    defaultBranch: 'main',
    latestCommit: 'release(android): Quant v1.0 universal APK build (targetSdk 36)',
    latestCommitSha: 'fa303afb',
    latestCommitTime: '2 hours ago',
    checksStatus: 'passing',
    license: 'Apache-2.0',
    website: 'https://quantmail.in',
    topics: ['android', 'kotlin', 'compose', 'apk', 'mobile'],
    branchCount: 16,
    commitCount: 394,
    branches: ['main', 'feat/jetpack-compose', 'fix/webview-perf'],
  },
];

// Mock File Tree Nodes — Realistic Sovereign Monorepo Hierarchy
export const MOCK_FILES: FileNode[] = [
  // --- Root Folders ---
  {
    name: '.github',
    path: '.github',
    type: 'dir',
    lastCommit: 'ci: unified vitest & linter test gate sweep',
    lastCommitDate: '2 hours ago',
  },
  {
    name: 'workflows',
    path: '.github/workflows',
    type: 'dir',
    lastCommit: 'ci: configure matrix for android, web, and server-core',
    lastCommitDate: '2 hours ago',
  },
  {
    name: 'ci.yml',
    path: '.github/workflows/ci.yml',
    type: 'file',
    size: '2.8 KB',
    lastCommit: 'ci: configure matrix for android, web, and server-core',
    lastCommitDate: '2 hours ago',
    content: `name: CI Matrix
on: [push, pull_request]

jobs:
  test:
    name: Vitest & Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run test typecheck lint`,
  },
  {
    name: 'release.yml',
    path: '.github/workflows/release.yml',
    type: 'file',
    size: '1.9 KB',
    lastCommit: 'release: automate semantic release tags and notes',
    lastCommitDate: '3 days ago',
    content: `name: Release
on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm build
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2`,
  },
  {
    name: 'security.yml',
    path: '.github/workflows/security.yml',
    type: 'file',
    size: '1.4 KB',
    lastCommit: 'security: enable CodeQL & gitleaks scanner',
    lastCommitDate: '1 week ago',
    content: `name: Security Audit
on:
  schedule:
    - cron: '0 0 * * 1'
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm audit --prod`,
  },
  {
    name: 'android-project',
    path: 'android-project',
    type: 'dir',
    lastCommit: 'feat(mobile): native Jetpack Compose sovereign client',
    lastCommitDate: '1 hour ago',
  },
  {
    name: 'app',
    path: 'android-project/app',
    type: 'dir',
    lastCommit: 'feat(mobile): hardware-accelerated WebView engine',
    lastCommitDate: '1 hour ago',
  },
  {
    name: 'build.gradle.kts',
    path: 'android-project/app/build.gradle.kts',
    type: 'file',
    size: '3.6 KB',
    lastCommit: 'build: target Android SDK 36 with desugaring',
    lastCommitDate: '1 hour ago',
    content: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "in.quantmail.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "in.quantmail.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }
}`,
  },
  {
    name: 'src',
    path: 'android-project/app/src',
    type: 'dir',
    lastCommit: 'feat(mobile): compose main activity and navigation graph',
    lastCommitDate: '1 hour ago',
  },
  {
    name: 'MainActivity.kt',
    path: 'android-project/app/src/MainActivity.kt',
    type: 'file',
    size: '5.2 KB',
    lastCommit: 'feat(mobile): compose main activity and navigation graph',
    lastCommitDate: '1 hour ago',
    content: `package in.quantmail.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                QuantSovereignApp()
            }
        }
    }
}`,
  },
  {
    name: 'apk testing',
    path: 'apk testing',
    type: 'dir',
    lastCommit: 'release(android): Quant v1.0 universal APK build',
    lastCommitDate: '1 hour ago',
  },
  {
    name: 'quant-v1.0.0-universal-release.apk',
    path: 'apk testing/quant-v1.0.0-universal-release.apk',
    type: 'file',
    size: '11.4 MB',
    lastCommit: 'release(android): Quant v1.0 universal APK build',
    lastCommitDate: '1 hour ago',
  },
  {
    name: 'SHA256SUMS.txt',
    path: 'apk testing/SHA256SUMS.txt',
    type: 'file',
    size: '128 B',
    lastCommit: 'release(android): checksum verification file',
    lastCommitDate: '1 hour ago',
    content: `fa303afb918a2cd8b88494c2598fe1a2d59302194b150937cbb519847128dfac  quant-v1.0.0-universal-release.apk`,
  },
  {
    name: 'apps',
    path: 'apps',
    type: 'dir',
    lastCommit: 'feat(quantmail): top command deck & 1:1 GitHub workspace',
    lastCommitDate: 'just now',
  },
  {
    name: 'quantmail',
    path: 'apps/quantmail',
    type: 'dir',
    lastCommit: 'feat(quantgit): implement real file tree and markdown preview',
    lastCommitDate: 'just now',
  },
  {
    name: 'package.json',
    path: 'apps/quantmail/package.json',
    type: 'file',
    size: '2.4 KB',
    lastCommit: 'chore: bump dependencies to react 19 and next 15',
    lastCommitDate: '2 days ago',
    content: `{
  "name": "@quant/quantmail",
  "version": "1.0.0",
  "private": true,
  "type": "module"
}`,
  },
  {
    name: 'src',
    path: 'apps/quantmail/src',
    type: 'dir',
    lastCommit: 'feat(quantgit): add CodeTab file explorer tree and breadcrumbs',
    lastCommitDate: 'just now',
  },
  {
    name: 'app',
    path: 'apps/quantmail/src/app',
    type: 'dir',
    lastCommit: 'feat(quantgit): full github sovereign parity screens',
    lastCommitDate: 'just now',
  },
  {
    name: 'quantgit',
    path: 'apps/quantmail/src/app/quantgit',
    type: 'dir',
    lastCommit: 'feat(quantgit): tree view, markdown preview and branch switcher',
    lastCommitDate: 'just now',
  },
  {
    name: 'CodeTab.tsx',
    path: 'apps/quantmail/src/app/quantgit/CodeTab.tsx',
    type: 'file',
    size: '18.2 KB',
    lastCommit: 'feat(quantgit): implement real git file tree explorer and markdown preview',
    lastCommitDate: 'just now',
    content: `// QuantGit CodeTab Component\nexport function CodeTab() { /* ... */ }`,
  },
  {
    name: 'page.tsx',
    path: 'apps/quantmail/src/app/quantgit/page.tsx',
    type: 'file',
    size: '82.4 KB',
    lastCommit: 'feat(quantgit): sovereign operating workspace coordinator',
    lastCommitDate: 'just now',
    content: `'use client';\nexport default function QuantGitPage() { /* ... */ }`,
  },
  {
    name: 'constants.ts',
    path: 'apps/quantmail/src/app/quantgit/constants.ts',
    type: 'file',
    size: '28.5 KB',
    lastCommit: 'feat(quantgit): realistic repository hierarchy with nested trees',
    lastCommitDate: 'just now',
  },
  {
    name: 'types.ts',
    path: 'apps/quantmail/src/app/quantgit/types.ts',
    type: 'file',
    size: '4.8 KB',
    lastCommit: 'types: define TreeFileNode and GitBlob types',
    lastCommitDate: 'just now',
  },
  {
    name: 'lib',
    path: 'apps/quantmail/src/lib',
    type: 'dir',
    lastCommit: 'lib: quantgit route resolver and parser',
    lastCommitDate: 'yesterday',
  },
  {
    name: 'quantgit-route.ts',
    path: 'apps/quantmail/src/lib/quantgit-route.ts',
    type: 'file',
    size: '4.1 KB',
    lastCommit: 'lib: quantgit route resolver and parser',
    lastCommitDate: 'yesterday',
  },
  {
    name: 'quantchat',
    path: 'apps/quantchat',
    type: 'dir',
    lastCommit: 'feat(webrtc): LiveKit SFU cluster resilience and voice agents',
    lastCommitDate: 'yesterday',
  },
  {
    name: 'package.json',
    path: 'apps/quantchat/package.json',
    type: 'file',
    size: '1.8 KB',
    lastCommit: 'feat(webrtc): add livekit-client and soundfx',
    lastCommitDate: 'yesterday',
  },
  {
    name: 'src',
    path: 'apps/quantchat/src',
    type: 'dir',
    lastCommit: 'feat(chat): real-time channels and voice gateway',
    lastCommitDate: 'yesterday',
  },
  {
    name: 'index.ts',
    path: 'apps/quantchat/src/index.ts',
    type: 'file',
    size: '3.4 KB',
    lastCommit: 'feat(chat): real-time channels and voice gateway',
    lastCommitDate: 'yesterday',
  },
  {
    name: 'quantdrive',
    path: 'apps/quantdrive',
    type: 'dir',
    lastCommit: 'feat(drive): chunked multipart uploads and star/trash state machine',
    lastCommitDate: '2 days ago',
  },
  {
    name: 'package.json',
    path: 'apps/quantdrive/package.json',
    type: 'file',
    size: '1.9 KB',
    lastCommit: 'deps: s3-client and crypto upload tokens',
    lastCommitDate: '2 days ago',
  },
  {
    name: 'src',
    path: 'apps/quantdrive/src',
    type: 'dir',
    lastCommit: 'feat(drive): chunked multipart upload and star state',
    lastCommitDate: '2 days ago',
  },
  {
    name: 'index.ts',
    path: 'apps/quantdrive/src/index.ts',
    type: 'file',
    size: '4.2 KB',
    lastCommit: 'feat(drive): chunked multipart upload and star state',
    lastCommitDate: '2 days ago',
  },
  {
    name: 'quantai',
    path: 'apps/quantai',
    type: 'dir',
    lastCommit: 'feat(swarm): local ONNX inference and model registry',
    lastCommitDate: '1 day ago',
  },
  {
    name: 'package.json',
    path: 'apps/quantai/package.json',
    type: 'file',
    size: '2.1 KB',
    lastCommit: 'deps: onnxruntime-node and vector embeddings',
    lastCommitDate: '1 day ago',
  },
  {
    name: 'src',
    path: 'apps/quantai/src',
    type: 'dir',
    lastCommit: 'feat(swarm): local ONNX inference and model registry',
    lastCommitDate: '1 day ago',
  },
  {
    name: 'index.ts',
    path: 'apps/quantai/src/index.ts',
    type: 'file',
    size: '5.1 KB',
    lastCommit: 'feat(swarm): local ONNX inference and model registry',
    lastCommitDate: '1 day ago',
  },
  {
    name: 'backend',
    path: 'backend',
    type: 'dir',
    lastCommit: 'feat(collab): Yjs CRDT real-time persistence',
    lastCommitDate: 'yesterday',
  },
  {
    name: 'app.ts',
    path: 'backend/app.ts',
    type: 'file',
    size: '14.2 KB',
    lastCommit: 'feat(server): Fastify 5 core with sovereign auth hooks',
    lastCommitDate: 'yesterday',
    content: `import Fastify from 'fastify';

export const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'healthy', uptime: process.uptime() }));`,
  },
  {
    name: 'worker.ts',
    path: 'backend/worker.ts',
    type: 'file',
    size: '8.6 KB',
    lastCommit: 'feat(queue): Redis bullmq event consumers and processors',
    lastCommitDate: 'yesterday',
    content: `import { Worker } from 'bullmq';

export const worker = new Worker('quant-tasks', async (job) => {
  return { processed: true, id: job.id };
});`,
  },
  {
    name: 'docs',
    path: 'docs',
    type: 'dir',
    lastCommit: 'docs(architecture): update 10 keeper apps ledger',
    lastCommitDate: '2 days ago',
  },
  {
    name: 'ARCHITECTURE.md',
    path: 'docs/ARCHITECTURE.md',
    type: 'file',
    size: '16.4 KB',
    lastCommit: 'docs(architecture): unified operating system RFC-04',
    lastCommitDate: '2 days ago',
    content: `# Quant Architecture RFC-04

A sovereign, unified monorepo for intelligent email, real-time collaboration, and git.`,
  },
  {
    name: 'API.md',
    path: 'docs/API.md',
    type: 'file',
    size: '11.8 KB',
    lastCommit: 'docs(api): REST and WebSocket gateway endpoints',
    lastCommitDate: '2 days ago',
    content: `# Quant Public APIs

Complete reference for QuantMail, QuantGit, and QuantChat REST/WebSocket protocols.`,
  },
  {
    name: 'packages',
    path: 'packages',
    type: 'dir',
    lastCommit: 'refactor(shared-ui): fluid bubble intelligence without eyes',
    lastCommitDate: '2 hours ago',
  },
  {
    name: 'auth',
    path: 'packages/auth',
    type: 'dir',
    lastCommit: 'feat(auth): ed25519 token rotation & timing-safe compare',
    lastCommitDate: '4 hours ago',
  },
  {
    name: 'package.json',
    path: 'packages/auth/package.json',
    type: 'file',
    size: '1.2 KB',
    lastCommit: 'chore: package metadata',
    lastCommitDate: '4 hours ago',
    content: `{\n  "name": "@quant/auth",\n  "version": "1.0.0"\n}`,
  },
  {
    name: 'src',
    path: 'packages/auth/src',
    type: 'dir',
    lastCommit: 'feat(auth): token service and session manager',
    lastCommitDate: '4 hours ago',
  },
  {
    name: 'index.ts',
    path: 'packages/auth/src/index.ts',
    type: 'file',
    size: '6.4 KB',
    lastCommit: 'feat(auth): token service and session manager',
    lastCommitDate: '4 hours ago',
    content: `export * from './tokens';\nexport * from './session';\n`,
  },
  {
    name: 'storage',
    path: 'packages/storage',
    type: 'dir',
    lastCommit: 'feat(storage): S3 & minio zero-knowledge blob adapter',
    lastCommitDate: '3 hours ago',
  },
  {
    name: 'package.json',
    path: 'packages/storage/package.json',
    type: 'file',
    size: '1.4 KB',
    lastCommit: 'chore: package metadata',
    lastCommitDate: '3 hours ago',
    content: `{\n  "name": "@quant/storage",\n  "version": "1.0.0"\n}`,
  },
  {
    name: 'src',
    path: 'packages/storage/src',
    type: 'dir',
    lastCommit: 'feat(storage): chunked multipart and checksum engine',
    lastCommitDate: '3 hours ago',
  },
  {
    name: 'index.ts',
    path: 'packages/storage/src/index.ts',
    type: 'file',
    size: '8.1 KB',
    lastCommit: 'feat(storage): chunked multipart and checksum engine',
    lastCommitDate: '3 hours ago',
    content: `export interface StorageEngine {
  uploadChunk(stream: ReadableStream, size: number): Promise<string>;
  verifyChecksum(sha256: string): boolean;
}`,
  },
  {
    name: 'shared-ui',
    path: 'packages/shared-ui',
    type: 'dir',
    lastCommit: 'refactor(shared-ui): fluid bubble intelligence without eyes',
    lastCommitDate: '2 hours ago',
  },
  {
    name: 'package.json',
    path: 'packages/shared-ui/package.json',
    type: 'file',
    size: '1.3 KB',
    lastCommit: 'chore: package metadata',
    lastCommitDate: '2 hours ago',
    content: `{\n  "name": "@quant/shared-ui",\n  "version": "1.0.0"\n}`,
  },
  {
    name: 'src',
    path: 'packages/shared-ui/src',
    type: 'dir',
    lastCommit: 'components: bubble avatar, theme toggles, modal dialogs',
    lastCommitDate: '2 hours ago',
  },
  {
    name: 'index.ts',
    path: 'packages/shared-ui/src/index.ts',
    type: 'file',
    size: '4.7 KB',
    lastCommit: 'components: bubble avatar, theme toggles, modal dialogs',
    lastCommitDate: '2 hours ago',
    content: `export * from './BubbleAvatar';\nexport * from './ThemeToggle';\n`,
  },
  {
    name: 'common',
    path: 'packages/common',
    type: 'dir',
    lastCommit: 'chore: common utilities and error types',
    lastCommitDate: '4 hours ago',
  },
  {
    name: 'package.json',
    path: 'packages/common/package.json',
    type: 'file',
    size: '1.1 KB',
    lastCommit: 'chore: package metadata',
    lastCommitDate: '4 hours ago',
    content: `{\n  "name": "@quant/common",\n  "version": "1.0.0"\n}`,
  },
  {
    name: 'src',
    path: 'packages/common/src',
    type: 'dir',
    lastCommit: 'feat(common): assertNever, result type and logger',
    lastCommitDate: '4 hours ago',
  },
  {
    name: 'index.ts',
    path: 'packages/common/src/index.ts',
    type: 'file',
    size: '3.9 KB',
    lastCommit: 'feat(common): assertNever, result type and logger',
    lastCommitDate: '4 hours ago',
    content: `export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };\n`,
  },
  // --- Root Files ---
  {
    name: 'AGENT_MEMORY.md',
    path: 'AGENT_MEMORY.md',
    type: 'file',
    size: '98.5 KB',
    lastCommit: 'docs(memory): master agent memory & swarm ledger',
    lastCommitDate: '1 hour ago',
    content: `# 🧠 MASTER AGENT MEMORY & SWARM LEDGER

> **CRITICAL SYSTEM DIRECTIVE**: This file is the single source of truth for all sessions and new chats. Antigravity MUST read this file before replying to any message, perform 50x self-critique against hallucination, verify features with live Chrome button clicks, orchestrate Notion Agents (Opus 5 / GPT-6 Astra) to do deep coding, and write back all updates immediately.

## 🌟 1. PROJECT NORTH STAR
Quant is one account that gives you email, chat, social, video, dating, creation tools, cloud storage, and a coding platform — all controllable by a single personal AI.

## 👥 SWARM FLEET (8+ AGENTS)
- CEO Astra (Command)
- Dev 1: Auth & Security
- Dev 2: Sentinel & QA
- Dev 3: Calendar & Recurrence
- Dev 4: QuantDrive & Storage
- Dev 5: Workspaces & Collaboration
- Dev 6: CodeHub & Git Infrastructure
- Dev 7: QuantAI Swarm & Shared Memory`,
  },
  {
    name: 'TASK_PLANNER.md',
    path: 'TASK_PLANNER.md',
    type: 'file',
    size: '72.1 KB',
    lastCommit: 'chore(planner): update sprint milestones and live checkmarks',
    lastCommitDate: '1 hour ago',
    content: `# 📋 QUANT ECOSYSTEM — UNIFIED MASTER TASK PLANNER

- [x] PR #260 (b68b86e4): Master Consolidation PR
- [x] PR #247 (948e3612): QuantMail v2.0 Production Integration
- [x] Task APK-01: Setup official Android CLI and SDK 36
- [x] Task APK-02: Native Jetpack Compose sovereign client
- [x] Task APK-03: Universal debug APK build (11.39 MB)
- [x] Task APK-04: Distributed in 'apk testing/' on GitHub remote
- [x] Task GIT-03: Real Git file tree explorer & syntax-highlighted markdown README`,
  },
  {
    name: 'package.json',
    path: 'package.json',
    type: 'file',
    size: '2.14 KB',
    lastCommit: 'chore: upgrade monorepo dependencies and strict TypeScript',
    lastCommitDate: '3 days ago',
    content: `{
  "name": "quant-ecosystem",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "turbo": "^2.4.0",
    "vitest": "^2.1.0"
  }
}`,
  },
  {
    name: 'pnpm-lock.yaml',
    path: 'pnpm-lock.yaml',
    type: 'file',
    size: '412 KB',
    lastCommit: 'chore: lockfile sync for shared-ui bubble avatar',
    lastCommitDate: '3 days ago',
    content: `lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies:\n      turbo: 2.4.0\n      typescript: 5.9.0`,
  },
  {
    name: 'turbo.json',
    path: 'turbo.json',
    type: 'file',
    size: '1.1 KB',
    lastCommit: 'chore: define cache pipelines for build and test',
    lastCommitDate: '1 week ago',
    content: `{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "test": {
      "cache": false
    }
  }
}`,
  },
  {
    name: 'README.md',
    path: 'README.md',
    type: 'file',
    size: '4.82 KB',
    lastCommit: 'docs: update ecosystem quickstart & architecture overview',
    lastCommitDate: 'last week',
    content: `# Quant Ecosystem — The Next NVIDIA of Software

A unified sovereign operating ecosystem built for high-performance computing, intelligent mail triage, autonomous agentic development, and real git collaboration.

\`\`\`bash
# Clone the unified monorepo
git clone https://quantmail.in/quantgit/Quant-Ecosystem.git

# Install dependencies and start development
pnpm install && pnpm dev
\`\`\`

## 📦 Monorepo Architecture
- **Flagship QuantMail**: Lightning-fast triage, local ONNX semantic search, offline drafts.
- **QuantGit (CodeHub)**: 1:1 GitHub parity with Git Smart HTTP and real PR reviews.
- **QuantChat & Meet**: WebRTC LiveKit meetings, voice AI assistants, proactive alarms.
- **QuantDrive & Docs**: Multi-layer cloud storage, Yjs CRDT real-time document collaboration.
- **Native Android Sovereign Shell**: Jetpack Compose + hardware-accelerated WebView client in \`android-project/\`.

## ⚡ Quickstart
\`\`\`typescript
import { createApp } from '@quant/server-core';
import { quantAuthPlugin } from '@quant/auth';

const app = await createApp({ port: 3000 });
await app.register(quantAuthPlugin);
console.log('Quant Sovereign OS online');
\`\`\`

| Package | Status | Version |
| :--- | :--- | :--- |
| \`@quant/quantmail\` | Production | \`v2.0.4\` |
| \`@quant/auth\` | Active | \`v1.2.0\` |
| \`@quant/storage\` | Active | \`v1.1.0\` |
| \`@quant/shared-ui\` | Active | \`v1.0.8\` |

> [!NOTE]
> All services run with zero third-party tracking, sovereign user-held encryption keys, and isolated database schema tenants.`,
  },
];

// Initial Issues
export const INITIAL_ISSUES: IssueItem[] = [
  {
    id: 259,
    title: 'Fix QuantMail composer recipient tag overflow on small viewports',
    state: 'open',
    author: 'kundan',
    labels: [
      { name: 'bug', color: '#D73A4A' },
      { name: 'mobile', color: '#0E8A16' },
    ],
    commentsCount: 3,
    createdAt: '2 hours ago',
    body: 'On mobile viewports under 400px width, recipient pills in the email composer were wrapping awkwardly and causing horizontal layout overflow. Remediated via CSS flex-wrap and max-w-full containment.',
    assignee: 'Developer 6',
  },
  {
    id: 250,
    title: 'ADR-001: Consolidate Drive AI services & aggregate sum storage quota',
    state: 'open',
    author: 'astra-ceo',
    labels: [
      { name: 'architecture', color: '#1D76DB' },
      { name: 'storage', color: '#5319E7' },
    ],
    commentsCount: 8,
    createdAt: 'yesterday',
    body: 'Ported 5 Drive AI services (extract, summarize, search, duplicate, organize) into QuantMail Drive backend and replaced client-side quota calculation with single database aggregate sum query.',
    assignee: 'Developer 4',
  },
  {
    id: 138,
    title: 'CI Gate: Upgrade Vitest runner concurrency & memory pool clamps',
    state: 'open',
    author: 'sentinel',
    labels: [
      { name: 'ci/cd', color: '#FBCA04' },
      { name: 'performance', color: '#006B75' },
    ],
    commentsCount: 2,
    createdAt: '2 days ago',
    body: 'Increased Vitest worker pool to 4 isolated threads and added memory pool limit of 2048MB per worker to eliminate sporadic memory spikes during full-sweep CI runs.',
    assignee: 'Developer 2',
  },
  {
    id: 122,
    title: 'Zero-mock Yjs collaborative document branching and paragraph write-locks',
    state: 'open',
    author: 'forge',
    labels: [
      { name: 'docs', color: '#BFD4F2' },
      { name: 'crdt', color: '#D4C5F9' },
    ],
    commentsCount: 5,
    createdAt: '3 days ago',
    body: 'Implemented real CRDT document branching with 3-way Yjs merge and fine-grained paragraph permissions for multi-tenant enterprise editing.',
    assignee: 'Developer 5',
  },
  {
    id: 109,
    title: 'QuantChat LiveKit gateway WebRTC token refresh & background alarms',
    state: 'open',
    author: 'scout',
    labels: [
      { name: 'webrtc', color: '#E99695' },
      { name: 'realtime', color: '#0075CA' },
    ],
    commentsCount: 4,
    createdAt: '4 days ago',
    body: 'Added background keep-alive loop and automatic room token refresh before expiration during 60+ minute audio/video conferencing sessions.',
    assignee: 'Developer 7',
  },
];

// Initial Pull Requests
export const INITIAL_PRS: PRItem[] = [
  {
    id: 260,
    title: 'Master Consolidation PR (Waves B-F, Sprints 2-5, Wave F Deletions)',
    state: 'merged',
    author: 'astra-ceo',
    branchSource: 'feat/sprint-master-consolidation',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 14,
    createdAt: 'yesterday',
    body: 'Unified monorepo consolidation: pruned 7 dead standalone apps (-47,882 lines), integrated LiveKit WebRTC, Yjs CRDT docs, RRULE calendar recurrence, and 3-layer shared memory.',
    additions: 12450,
    deletions: 47882,
    changedFiles: 182,
  },
  {
    id: 257,
    title: 'feat(branding): Rebrand apps to @quant/quantwave, quantgram, and quantcooks',
    state: 'merged',
    author: 'pixel',
    branchSource: 'feat/app-rebranding',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 4,
    createdAt: '2 days ago',
    body: 'Cleaned up monorepo package identifiers and updated SSO permission scopes across all rebranded apps.',
    additions: 420,
    deletions: 310,
    changedFiles: 18,
  },
  {
    id: 261,
    title: 'feat(quantgit): 1:1 GitHub Full Functional Parity & Pixel-Perfect Dark UI/UX',
    state: 'open',
    author: 'Developer 6',
    branchSource: 'feat/quantgit-github-parity',
    branchTarget: 'main',
    checksStatus: 'passing',
    commentsCount: 6,
    createdAt: 'just now',
    body: 'Implemented complete 1:1 GitHub parity: all 10 tabs (Code, Issues, PRs, Agents, Discussions, Actions, Projects, Security, Insights, Settings), Two-column repository layout, line-numbered Blob Viewer, File Finder, Branch Switcher, Releases APK download drawer, and docked bottom deck.',
    additions: 2528,
    deletions: 646,
    changedFiles: 48,
  },
];

// Initial Discussions
export const INITIAL_DISCUSSIONS: DiscussionItem[] = [
  {
    id: 1,
    title: '📢 Quant Ecosystem v1.0 Staging Release & Android APK Distribution',
    category: 'Announcements',
    author: 'astra-ceo',
    upvotes: 42,
    commentsCount: 18,
    createdAt: '2 hours ago',
    body: 'We are thrilled to announce that Quant v1.0 Universal APK is officially compiled and downloadable directly from GitHub remote under apk testing/! Feedback welcome.',
  },
  {
    id: 2,
    title: '💡 RFC: Unified Credits Wallet ($1 = 1 Credit) & Creator Monetization',
    category: 'Ideas',
    author: 'ledger',
    upvotes: 29,
    commentsCount: 7,
    createdAt: 'yesterday',
    body: 'Proposing a unified credit model where creator earnings in QuantWave & QuantGram flow into a single wallet, redeemable via UPI and Stripe daily.',
  },
  {
    id: 3,
    title: '🙏 Best practices for configuring local ONNX runtime embeddings in QuantMail',
    category: 'Q&A',
    author: 'scout',
    upvotes: 19,
    commentsCount: 5,
    createdAt: '3 days ago',
    body: 'What is the optimal model size and quantization format (int8 vs fp16) for client-side web worker embeddings without burning laptop battery?',
  },
];

// Initial Actions Runs
export const INITIAL_ACTIONS: WorkflowRunItem[] = [
  {
    id: 34826613070,
    name: 'feat(quantgit): restore 4 bottom deck tabs, repos overview & publish …',
    workflow: 'Deploy staging (OIDC)',
    status: 'success',
    branch: 'main',
    event: 'workflow_dispatch',
    commitSha: 'ac612198',
    duration: '4m 55s',
    timeAgo: '15 minutes ago',
    jobs: [
      { name: 'Validate immutable main release', status: 'success', duration: '4s' },
      { name: 'Build and deploy quantmail', status: 'success', duration: '4m 51s' },
    ],
  },
  {
    id: 34826179762,
    name: 'feat(quantgit): restore 4 bottom deck tabs, repos overview & publish …',
    workflow: 'CI',
    status: 'success',
    branch: 'main',
    event: 'push',
    commitSha: 'ac612198',
    duration: '4m 18s',
    timeAgo: '25 minutes ago',
    jobs: [
      { name: 'gate', status: 'success', duration: '4m 18s' },
      { name: 'quantchat-coverage', status: 'success', duration: '1m 20s' },
      { name: 'memory-shadow-postgres', status: 'success', duration: '1m 45s' },
      { name: 'full-sweep', status: 'success', duration: '18m 20s' },
    ],
  },
  {
    id: 34826179781,
    name: 'feat(quantgit): restore 4 bottom deck tabs, repos overview & publish …',
    workflow: 'CodeQL Advanced',
    status: 'success',
    branch: 'main',
    event: 'push',
    commitSha: 'ac612198',
    duration: '3m 22s',
    timeAgo: '28 minutes ago',
    jobs: [
      { name: 'Analyze (javascript-typescript)', status: 'success', duration: '3m 10s' },
      { name: 'Analyze (python)', status: 'success', duration: '1m 05s' },
    ],
  },
];

// Initial Projects Kanban Cards
export const INITIAL_PROJECT_CARDS: ProjectCard[] = [
  {
    id: 'c1',
    title: 'Android APK Distribution on GitHub',
    column: 'done',
    tag: 'Mobile',
    assignee: 'Developer 6',
  },
  {
    id: 'c2',
    title: '1:1 GitHub Navigation & Two-Column Parity',
    column: 'done',
    tag: 'QuantGit',
    assignee: 'Pixel',
  },
  {
    id: 'c3',
    title: 'Line-Numbered File Blob Viewer & Copy Raw',
    column: 'done',
    tag: 'CodeHub',
    assignee: 'Forge',
  },
  {
    id: 'c4',
    title: 'Full 10-Tab Experience (Discussions, Projects, Security)',
    column: 'in_progress',
    tag: 'Core',
    assignee: 'Astra',
  },
  {
    id: 'c5',
    title: 'Real-time WebSocket Collaborative Terminal',
    column: 'todo',
    tag: 'QuantAI',
    assignee: 'Ledger',
  },
  {
    id: 'c6',
    title: 'Hardware YubiKey MFA Support in SSO',
    column: 'todo',
    tag: 'Auth',
    assignee: 'Developer 1',
  },
];

// Initial Security Alerts
export const INITIAL_SECURITY_ALERTS: SecurityAlert[] = [
  {
    id: 'sec-1',
    package: 'tar < 6.2.1',
    severity: 'moderate',
    cve: 'CVE-2024-37890',
    title: 'Arbitrary File Overwrite via symlink directory traversal',
    state: 'open',
  },
  {
    id: 'sec-2',
    package: 'micromatch < 4.0.8',
    severity: 'moderate',
    cve: 'CVE-2024-4067',
    title: 'Regular Expression Denial of Service (ReDoS) in glob parsing',
    state: 'open',
  },
  {
    id: 'sec-3',
    package: 'ws < 8.17.1',
    severity: 'low',
    cve: 'CVE-2024-37891',
    title: 'WebSocket payload framing timing side-channel',
    state: 'open',
  },
  {
    id: 'sec-4',
    package: 'braces < 3.0.3',
    severity: 'low',
    cve: 'CVE-2024-4068',
    title: 'Uncontrolled resource consumption in string expansion',
    state: 'open',
  },
];

// Swarm Fleet Catalog
export const AGENT_FLEET_CATALOG: DeployedAgent[] = [
  {
    id: 'astra',
    name: 'Astra',
    role: 'Executive Lead & Architecture Gatekeeper',
    pod: 'COMMAND',
    status: 'active',
    currentTask:
      'Enforcing 1:1 GitHub parity, two-column layout, and zero-hallucination verification.',
    initial: 'A',
    color: '#FF8C42',
    steps: [
      'Audited GitHub dark UI tokens',
      'Verified 10 repository tabs',
      'Confirmed live EKS staging build',
    ],
    thoughts:
      'All 10 tabs must have interactive functionality and reflect authentic GitHub dark theme (#0D1117).',
  },
  {
    id: 'sentinel',
    name: 'Sentinel',
    role: 'Audit & QA Sentinel',
    pod: 'SHIELD',
    status: 'analyzing',
    currentTask:
      'Continuous Vitest regression & CI gate surveillance across all monorepo packages.',
    initial: 'S',
    color: '#34D399',
    steps: [
      'Gate sweep passed in 4m18s',
      'Typecheck clean (zero emit errors)',
      'Zero console exceptions',
    ],
    thoughts: 'Watching test worker memory footprints and confirming zero unhandled exceptions.',
  },
  {
    id: 'forge',
    name: 'Forge',
    role: 'Fullstack Monorepo Engine',
    pod: 'ENGINE',
    status: 'building',
    currentTask:
      'Building 1:1 File Tree explorer with clickable blob viewer and breadcrumb navigation.',
    initial: 'F',
    color: '#60A5FA',
    steps: [
      'Parsed GitHub table layout',
      'Added line numbers to file viewer',
      'Wired branch selector modal',
    ],
    thoughts:
      'Developers expect to click on files and see line numbers, copy raw, and commit messages.',
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'Codebase Researcher',
    pod: 'RECON',
    status: 'idle',
    currentTask: 'Mapping competitor features from logged-in GitHub web sessions.',
    initial: 'R',
    color: '#A78BFA',
    steps: [
      'Inspected GitHub repo header',
      'Captured clone drawer protocol tabs',
      'Mapped Kanban project columns',
    ],
    thoughts:
      'GitHub puts Releases in the right sidebar with quick binary downloads. Quant APK must sit right there.',
  },
  {
    id: 'pixel',
    name: 'Pixel',
    role: 'UI/UX & Design Systems',
    pod: 'CANVAS',
    status: 'active',
    currentTask:
      'Polishing GitHub dark tokens (#0D1117, #010409, #30363D) and green buttons (#238636).',
    initial: 'P',
    color: '#F472B6',
    steps: [
      'Eliminated cartoon eyes from mascot',
      'Created authentic GitHub tabs with orange underline',
      'Added 2-column layout',
    ],
    thoughts:
      'The user wants real GitHub look and feel, not generic cards. Exact border colors make the difference.',
  },
  {
    id: 'ledger',
    name: 'Ledger',
    role: 'Database & Storage Migrations',
    pod: 'VAULT',
    status: 'idle',
    currentTask:
      'Managing repository tables, branches, issues, and pull requests in Prisma schema.',
    initial: 'L',
    color: '#FBBF24',
    steps: [
      'Schema 0058 verified',
      'Storage quota aggregate sum verified',
      'Prisma client generated',
    ],
    thoughts: 'All issue numbers and PR numbers must increment deterministically.',
  },
];

export const INITIAL_COMMITS: CommitItem[] = [
  {
    sha: 'c4e6121980a34b2f81907de415b3901a81234567',
    shortSha: 'c4e6121',
    message: 'feat(quantgit): implement full GitHub commits history tree and branch parity',
    body: 'Added date-grouped timeline, diff viewer with additions and deletions, and branch creation modal.',
    author: {
      name: 'kundansinghrajput31980',
      username: 'kundansinghrajput31980',
      email: 'kundan@quantmail.in',
      avatarUrl: '',
    },
    date: 'Sep 26, 2026',
    relativeTime: '2 hours ago',
    verified: true,
    verificationReason: 'GPG Key ID: 4A8B9C0D (Quant Sovereign Vault)',
    stats: {
      totalFiles: 3,
      additions: 42,
      deletions: 12,
    },
    files: [
      {
        filename: 'apps/quantmail/src/app/quantgit/components/CommitsTab.tsx',
        status: 'added',
        additions: 28,
        deletions: 4,
        lines: [
          {
            type: 'context',
            oldLineNumber: 1,
            newLineNumber: 1,
            content: "import React, { useState } from 'react';",
          },
          {
            type: 'addition',
            newLineNumber: 2,
            content: '+export function CommitsTab({ repo, commits }: CommitsTabProps) {',
          },
          {
            type: 'addition',
            newLineNumber: 3,
            content:
              '+  const [selectedCommit, setSelectedCommit] = useState<CommitItem | null>(null);',
          },
          { type: 'deletion', oldLineNumber: 2, content: '-// legacy commits placeholder' },
          { type: 'context', oldLineNumber: 3, newLineNumber: 4, content: '  return (' },
          {
            type: 'addition',
            newLineNumber: 5,
            content: '+    <div data-testid="commits-timeline" className="space-y-6">',
          },
        ],
      },
      {
        filename: 'apps/quantmail/src/app/quantgit/components/BranchesTab.tsx',
        status: 'added',
        additions: 12,
        deletions: 6,
        lines: [
          {
            type: 'context',
            oldLineNumber: 1,
            newLineNumber: 1,
            content: "import React, { useState } from 'react';",
          },
          {
            type: 'addition',
            newLineNumber: 2,
            content: '+export function BranchesTab({ repo, branches }: BranchesTabProps) {',
          },
          { type: 'deletion', oldLineNumber: 2, content: '-// legacy branches placeholder' },
          {
            type: 'addition',
            newLineNumber: 3,
            content: '+  const [searchQuery, setSearchQuery] = useState("");',
          },
        ],
      },
      {
        filename: 'apps/quantmail/src/app/quantgit/page.tsx',
        status: 'modified',
        additions: 2,
        deletions: 2,
        lines: [
          {
            type: 'context',
            oldLineNumber: 88,
            newLineNumber: 88,
            content: '  const [activeGitHubTab, setActiveGitHubTab] = useState<GitHubTab>("code");',
          },
          {
            type: 'deletion',
            oldLineNumber: 1675,
            content: '-            { id: "code", label: "<> Code", badge: null },',
          },
          {
            type: 'addition',
            newLineNumber: 1675,
            content: '+            { id: "code", label: "<> Code", badge: null },',
          },
          {
            type: 'addition',
            newLineNumber: 1676,
            content: '+            { id: "commits", label: "⎇ Commits", badge: 4 },',
          },
        ],
      },
    ],
  },
  {
    sha: 'a91f3c80e123456789abcdef0123456789abcdef',
    shortSha: 'a91f3c8',
    message: 'fix(auth): harden git smart http token validation',
    body: 'Enforce constant-time token comparison and session expiry checks.',
    author: {
      name: 'Developer 6',
      username: 'dev6',
      email: 'dev6@quantmail.in',
    },
    date: 'Sep 26, 2026',
    relativeTime: '5 hours ago',
    verified: true,
    verificationReason: 'GPG Key ID: 7E6F5D4C (Quant Sovereign Vault)',
    stats: {
      totalFiles: 1,
      additions: 15,
      deletions: 3,
    },
    files: [
      {
        filename: 'apps/quantmail/backend/routes/repos.ts',
        status: 'modified',
        additions: 15,
        deletions: 3,
        lines: [
          {
            type: 'context',
            oldLineNumber: 760,
            newLineNumber: 760,
            content: 'async function loadReadableRepo(request, idOrName) {',
          },
          {
            type: 'addition',
            newLineNumber: 761,
            content: '+  const safeCompare = crypto.timingSafeEqual;',
          },
          { type: 'deletion', oldLineNumber: 761, content: '-  if (token === expected) {' },
          {
            type: 'addition',
            newLineNumber: 762,
            content: '+  if (safeCompare(Buffer.from(token), Buffer.from(expected))) {',
          },
        ],
      },
    ],
  },
  {
    sha: '8b72d140e123456789abcdef0123456789abcdef',
    shortSha: '8b72d14',
    message: 'perf(git): optimize AST tree traversal for monorepo roots',
    body: 'Use indexed bloom filters to eliminate redundant stat operations on bare git repos.',
    author: {
      name: 'CEO Astra',
      username: 'astra',
      email: 'astra@quantmail.in',
    },
    date: 'Sep 25, 2026',
    relativeTime: 'Yesterday',
    verified: true,
    verificationReason: 'GPG Key ID: 1A2B3C4D (Quant Sovereign Vault)',
    stats: {
      totalFiles: 2,
      additions: 35,
      deletions: 18,
    },
    files: [
      {
        filename: 'packages/git-engine/src/tree.ts',
        status: 'modified',
        additions: 35,
        deletions: 18,
        lines: [
          {
            type: 'context',
            oldLineNumber: 12,
            newLineNumber: 12,
            content: 'export async function traverseTree(sha: string) {',
          },
          { type: 'addition', newLineNumber: 13, content: '+  const cached = treeCache.get(sha);' },
          { type: 'addition', newLineNumber: 14, content: '+  if (cached) return cached;' },
        ],
      },
    ],
  },
  {
    sha: '20af80f8e123456789abcdef0123456789abcdef',
    shortSha: '20af80f',
    message: 'feat(core): Wave 39 core monorepo parity rollout',
    body: 'Complete delivery of 98-screen Instagram, 131-screen ChatGPT, and 159-screen GitHub parity.',
    author: {
      name: 'kundansinghrajput31980',
      username: 'kundansinghrajput31980',
      email: 'kundan@quantmail.in',
    },
    date: 'Sep 25, 2026',
    relativeTime: 'Yesterday',
    verified: true,
    verificationReason: 'GPG Key ID: 4A8B9C0D (Quant Sovereign Vault)',
    stats: {
      totalFiles: 4,
      additions: 84,
      deletions: 22,
    },
    files: [
      {
        filename: 'apps/quantmail/src/app/quantgit/constants.ts',
        status: 'modified',
        additions: 84,
        deletions: 22,
        lines: [
          {
            type: 'context',
            oldLineNumber: 40,
            newLineNumber: 40,
            content: 'export const INITIAL_REPOS = [',
          },
          { type: 'addition', newLineNumber: 41, content: '+  // Wave 39 ratified constants' },
        ],
      },
    ],
  },
];

export const INITIAL_BRANCHES: BranchItem[] = [
  {
    name: 'main',
    sha: 'c4e6121980a34b2f81907de415b3901a81234567',
    isDefault: true,
    isProtected: true,
    protection: 'require_reviews',
    aheadBy: 0,
    behindBy: 0,
    lastCommitAuthor: 'kundansinghrajput31980',
    lastCommitMessage:
      'feat(quantgit): implement full GitHub commits history tree and branch parity',
    lastCommitTime: '2 hours ago',
  },
  {
    name: 'feat/sprint-7-github-parity',
    sha: 'a91f3c80e123456789abcdef0123456789abcdef',
    isDefault: false,
    isProtected: false,
    protection: 'none',
    aheadBy: 2,
    behindBy: 0,
    lastCommitAuthor: 'Developer 6',
    lastCommitMessage: 'fix(auth): harden git smart http token validation',
    lastCommitTime: '5 hours ago',
  },
  {
    name: 'fix/core-astra-audit',
    sha: '8b72d140e123456789abcdef0123456789abcdef',
    isDefault: false,
    isProtected: false,
    protection: 'none',
    aheadBy: 1,
    behindBy: 3,
    lastCommitAuthor: 'CEO Astra',
    lastCommitMessage: 'perf(git): optimize AST tree traversal for monorepo roots',
    lastCommitTime: 'Yesterday',
  },
  {
    name: 'release/v1.0.0-apk',
    sha: '20af80f8e123456789abcdef0123456789abcdef',
    isDefault: false,
    isProtected: false,
    protection: 'none',
    aheadBy: 0,
    behindBy: 1,
    lastCommitAuthor: 'kundansinghrajput31980',
    lastCommitMessage: 'feat(core): Wave 39 core monorepo parity rollout',
    lastCommitTime: '2 days ago',
  },
];
