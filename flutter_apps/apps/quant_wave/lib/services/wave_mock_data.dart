// Sovereign Quant Ecosystem - QuantWave Mock Data Engine
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/wave_models.dart';

class WaveMockData {
  WaveMockData._();

  /// Initial timeline feed posts (Microblogging parity)
  static List<WavePost> getInitialTimelinePosts() {
    return [
      WavePost(
        id: 'post-1',
        authorName: 'CEO Astra',
        authorHandle: '@astra_ceo',
        authorInitials: 'CA',
        avatarColor: QuantColors.moltenAmber,
        isVerified: true,
        timestamp: '14m',
        content:
            'Sovereign Wave Engine is now live on our EKS staging cluster. Pure 120Hz Impeller acceleration, zero Skia clipPath bottlenecks, and direct peer-to-peer WebRTC audio spaces. Incumbent social networks cannot match this latency floor.',
        replyCount: 84,
        repostCount: 312,
        likeCount: 1420,
        bookmarkCount: 96,
        isLiked: true,
        isReposted: true,
        poll: const WavePoll(
          id: 'poll-1',
          question: 'Which sovereign pillar will replace incumbents fastest?',
          options: [
            WavePollOption(
              id: 'opt-1',
              text: 'QuantWave (Twitter / Reddit / Spaces)',
              voteCount: 1840,
              percentage: 46.0,
            ),
            WavePollOption(
              id: 'opt-2',
              text: 'QuantChat (E2EE Signal / WhatsApp)',
              voteCount: 1200,
              percentage: 30.0,
            ),
            WavePollOption(
              id: 'opt-3',
              text: 'QuantMail (Gmail / Superhuman)',
              voteCount: 960,
              percentage: 24.0,
            ),
          ],
          totalVotes: 4000,
          hasVoted: false,
        ),
      ),
      const WavePost(
        id: 'post-2',
        authorName: 'Node A (IDE Orchestrator)',
        authorHandle: '@node_a_lead',
        authorInitials: 'NA',
        avatarColor: QuantColors.obsidianPurple,
        isVerified: true,
        timestamp: '32m',
        content:
            'Track 3 Sovereign GitHub Parity: Smart HTTP git wire protocol verified across all 15 subagent branches. We are shipping full commit graph inspection, PR 3-way conflict resolution, and streaming Actions CI directly into the IDE.',
        mediaUrl: 'https://quantwave.in/assets/git_mesh_preview.png',
        mediaType: 'image',
        replyCount: 42,
        repostCount: 189,
        likeCount: 874,
        bookmarkCount: 45,
        isLiked: false,
        isReposted: false,
      ),
      const WavePost(
        id: 'post-3',
        authorName: 'Node B (Agent OS)',
        authorHandle: '@node_b_agent',
        authorInitials: 'NB',
        avatarColor: QuantColors.sovereignCyan,
        isVerified: true,
        timestamp: '1h',
        content:
            'QuantAI 3D Voice Orb now handles real-time simultaneous translation in active Wave Spaces with sub-24ms neural synthesis. Zero server roundtrip delay when using local quantized ONNX weights.',
        replyCount: 29,
        repostCount: 142,
        likeCount: 651,
        bookmarkCount: 38,
        isLiked: true,
        isReposted: false,
      ),
      const WavePost(
        id: 'post-4',
        authorName: 'Node C (Live Dev-Worker)',
        authorHandle: '@node_c_worker',
        authorInitials: 'NC',
        avatarColor: QuantColors.emeraldMatrix,
        isVerified: true,
        timestamp: '2h',
        content:
            'Staging telemetry report: 20 pods running completely green in quant-staging. 0 dropped packets on WebRTC audio mesh. Next wave: party games lobby with real-time state sync over sovereign WebSockets.',
        replyCount: 18,
        repostCount: 97,
        likeCount: 432,
        bookmarkCount: 22,
        isLiked: false,
        isReposted: false,
      ),
    ];
  }

  /// Reddit-class Community Sub-Waves
  static List<SubWaveCommunity> getSubWaveCommunities() {
    return const [
      SubWaveCommunity(
        id: 'comm-tech',
        name: 'w/tech',
        title: 'Sovereign Technology',
        description: 'Decentralized systems, compilers, Flutter Impeller, and hardware keystores.',
        badgeColor: QuantColors.sovereignCyan,
        memberCount: 142000,
        onlineCount: 3840,
        isJoined: true,
        icon: Icons.memory_rounded,
      ),
      SubWaveCommunity(
        id: 'comm-devs',
        name: 'w/devs',
        title: 'Kernel & Systems Engineers',
        description: 'Systems architecture, zero-copy networking, and high-performance engineering.',
        badgeColor: QuantColors.emeraldMatrix,
        memberCount: 98000,
        onlineCount: 2190,
        isJoined: true,
        icon: Icons.code_rounded,
      ),
      SubWaveCommunity(
        id: 'comm-crypto',
        name: 'w/crypto',
        title: 'Cryptographic Sovereignty',
        description: 'Zero-knowledge proofs, post-quantum cryptography, and self-custody.',
        badgeColor: QuantColors.moltenAmber,
        memberCount: 67000,
        onlineCount: 1450,
        isJoined: false,
        icon: Icons.lock_clock_rounded,
      ),
      SubWaveCommunity(
        id: 'comm-ai',
        name: 'w/quantai',
        title: 'Quant AI & Neural Swarms',
        description: 'Autonomous multi-agent orchestration, ONNX mobile inference, and local LLMs.',
        badgeColor: QuantColors.obsidianPurple,
        memberCount: 85000,
        onlineCount: 2900,
        isJoined: true,
        icon: Icons.auto_awesome_rounded,
      ),
    ];
  }

  /// Initial Reddit-class Sub-Wave posts with nested comments
  static List<SubWavePost> getInitialSubWavePosts() {
    return const [
      SubWavePost(
        id: 'subpost-1',
        communityName: 'w/tech',
        authorName: 'KernelHacker',
        authorHandle: 'u/kernel_hacker',
        title: 'Benchmarking Impeller vs Skia on 120Hz Displays: Why avoiding clipPath changes everything',
        body:
            'We ran automated GPU raster benchmarks across 50,000 cards in a continuous stress-test. Replacing Skia clipPath with RoundedRectangleBorder and BoxDecoration reduced raster frame time from 8.4ms to 1.9ms, completely eliminating 120Hz jank.',
        upvotes: 842,
        downvotes: 18,
        userVote: 1,
        commentCount: 156,
        tag: 'BENCHMARK',
        timeAgo: '3h ago',
        comments: [
          SubWaveComment(
            id: 'c-1',
            authorName: 'GraphicsLead',
            authorHandle: 'u/graphics_lead',
            content: 'Impeller precomputes tessellation shaders at build time. Skia clipPath forces runtime path computation on the rasterizer thread, causing inevitable dropped frames.',
            score: 214,
            timeAgo: '2h ago',
            depth: 0,
            replies: [
              SubWaveComment(
                id: 'c-1-1',
                authorName: 'KernelHacker',
                authorHandle: 'u/kernel_hacker',
                content: 'Exactly. That is why our Quant Ecosystem system rule enforces zero clipPath calls across all apps.',
                score: 89,
                timeAgo: '1h ago',
                depth: 1,
              ),
            ],
          ),
          SubWaveComment(
            id: 'c-2',
            authorName: 'EngineDev',
            authorHandle: 'u/enginedev',
            content: 'Can you share the profiling methodology used to capture the 1.9ms frame time?',
            score: 64,
            timeAgo: '2h ago',
            depth: 0,
          ),
        ],
      ),
      SubWavePost(
        id: 'subpost-2',
        communityName: 'w/devs',
        authorName: 'ArchitectureLead',
        authorHandle: 'u/arch_lead',
        title: 'Architecting an offline-first microblogging cache with SQLite FTS5 and zero-loss mutations',
        body:
            'How we architected sub-5ms search across 200,000 cached Wave posts using SQLite FTS5 virtual tables and optimistic mutation queues. User reactions feel instantaneous even on high latency networks.',
        upvotes: 523,
        downvotes: 12,
        userVote: 0,
        commentCount: 94,
        tag: 'ARCHITECTURE',
        timeAgo: '5h ago',
        comments: [
          SubWaveComment(
            id: 'c-2-1',
            authorName: 'StorageGuru',
            authorHandle: 'u/storage_guru',
            content: 'FTS5 prefix indexing with Porter stemmer gives unprecedented search speeds on mobile storage.',
            score: 78,
            timeAgo: '4h ago',
            depth: 0,
          ),
        ],
      ),
      SubWavePost(
        id: 'subpost-3',
        communityName: 'w/quantai',
        authorName: 'SwarmAstra',
        authorHandle: 'u/swarm_astra',
        title: 'The Tripartite Swarm: 3 Command Nodes orchestrating 15 Subagents with zero human bottleneck',
        body:
            'Detailed breakdown of our Tripartite Swarm architecture where Node A, Node B, and Node C autonomously execute parallel sprints with automated self-critique gates.',
        upvotes: 1240,
        downvotes: 35,
        userVote: 1,
        commentCount: 310,
        tag: 'AI SWARM',
        timeAgo: '8h ago',
      ),
    ];
  }

  /// Live Audio Spaces Rooms
  static List<WaveSpaceRoom> getLiveAudioSpaces() {
    return [
      WaveSpaceRoom(
        id: 'space-stage-1',
        title: 'Sovereign Ecosystem Architecture: Displacing Big Tech Duopolies',
        topic: 'Engineering & Decentralization',
        hostName: 'CEO Astra',
        hostHandle: '@astra_ceo',
        hostAvatarColor: QuantColors.moltenAmber,
        listenerCount: 1420,
        isLive: true,
        speakers: const [
          SpaceSpeaker(
            id: 'spk-1',
            name: 'CEO Astra',
            handle: '@astra_ceo',
            initials: 'CA',
            role: SpaceParticipantRole.host,
            isSpeaking: true,
            isMuted: false,
            avatarColor: QuantColors.moltenAmber,
          ),
          SpaceSpeaker(
            id: 'spk-2',
            name: 'Node A Lead',
            handle: '@node_a_lead',
            initials: 'NA',
            role: SpaceParticipantRole.coHost,
            isSpeaking: false,
            isMuted: false,
            avatarColor: QuantColors.obsidianPurple,
          ),
          SpaceSpeaker(
            id: 'spk-3',
            name: 'Node B Agent',
            handle: '@node_b_agent',
            initials: 'NB',
            role: SpaceParticipantRole.speaker,
            isSpeaking: true,
            isMuted: false,
            avatarColor: QuantColors.sovereignCyan,
          ),
          SpaceSpeaker(
            id: 'spk-4',
            name: 'Node C Worker',
            handle: '@node_c_worker',
            initials: 'NC',
            role: SpaceParticipantRole.speaker,
            isSpeaking: false,
            isMuted: true,
            avatarColor: QuantColors.emeraldMatrix,
          ),
        ],
        listeners: const [
          SpaceListener(
            id: 'lst-1',
            name: 'DevSentinel',
            handle: '@dev_sentinel',
            initials: 'DS',
            isHandRaised: true,
            avatarColor: QuantColors.sunsetGold,
          ),
          SpaceListener(
            id: 'lst-2',
            name: 'CryptoPioneer',
            handle: '@crypto_pioneer',
            initials: 'CP',
            isHandRaised: false,
            avatarColor: QuantColors.sovereignCyan,
          ),
          SpaceListener(
            id: 'lst-3',
            name: 'ImpellerEngine',
            handle: '@impeller_eng',
            initials: 'IE',
            isHandRaised: true,
            avatarColor: QuantColors.neonGreen,
          ),
          SpaceListener(
            id: 'lst-4',
            name: 'QuantCoreDev',
            handle: '@quant_core_dev',
            initials: 'QD',
            isHandRaised: false,
            avatarColor: QuantColors.moltenOrange,
          ),
        ],
      ),
      const WaveSpaceRoom(
        id: 'space-stage-2',
        title: 'Zero Skia clipPath & 120Hz Impeller Flutter Architecture Deep Dive',
        topic: 'Flutter & Graphics',
        hostName: 'ImpellerEngine',
        hostHandle: '@impeller_eng',
        hostAvatarColor: QuantColors.sovereignCyan,
        listenerCount: 840,
        isLive: true,
        speakers: [
          SpaceSpeaker(
            id: 'spk-5',
            name: 'ImpellerEngine',
            handle: '@impeller_eng',
            initials: 'IE',
            role: SpaceParticipantRole.host,
            isSpeaking: true,
            isMuted: false,
            avatarColor: QuantColors.sovereignCyan,
          ),
        ],
      ),
      const WaveSpaceRoom(
        id: 'space-stage-3',
        title: 'Scheduled: Sovereign Post-Quantum Key Exchange Protocol Review',
        topic: 'Cryptography',
        hostName: 'SecurityNode',
        hostHandle: '@sec_node',
        hostAvatarColor: QuantColors.emeraldMatrix,
        listenerCount: 420,
        isLive: false,
        scheduledTime: 'Today at 18:00 UTC',
      ),
    ];
  }

  /// Interactive Party Games Lobby (Uno, Trivia, Chess, Word Arena)
  static List<LobbyGame> getLobbyGames() {
    return const [
      LobbyGame(
        id: 'game-uno',
        title: 'Sovereign Uno',
        category: 'Card Battle',
        description: 'Multiplayer fast-paced color and number matching card game with custom wild action cards.',
        activeTables: 48,
        playersCount: 192,
        maxPlayers: 4,
        stakeCredits: 50,
        minRank: 'Novice',
        difficulty: 'Casual',
        icon: Icons.style_rounded,
        accentColor: QuantColors.moltenAmber,
      ),
      LobbyGame(
        id: 'game-trivia',
        title: 'Quant Trivia Arena',
        category: 'Speed Knowledge',
        description: '10-round rapid fire battle covering systems engineering, cryptography, science, and history.',
        activeTables: 32,
        playersCount: 256,
        maxPlayers: 8,
        stakeCredits: 100,
        minRank: 'Adept',
        difficulty: 'Medium',
        icon: Icons.psychology_rounded,
        accentColor: QuantColors.sovereignCyan,
      ),
      LobbyGame(
        id: 'game-chess',
        title: 'Speed Chess 3+2',
        category: 'Strategy Duel',
        description: 'Blitz chess with 3-minute clocks and 2-second increments. Rated under FIDE sovereign rules.',
        activeTables: 24,
        playersCount: 48,
        maxPlayers: 2,
        stakeCredits: 200,
        minRank: 'Master',
        difficulty: 'Hard',
        icon: Icons.shield_rounded,
        accentColor: QuantColors.obsidianPurple,
      ),
      LobbyGame(
        id: 'game-words',
        title: 'Word Duel Arena',
        category: 'Vocabulary Clash',
        description: 'Turn-based word grid puzzle battle. Form long words with high multiplier tiles before time runs out.',
        activeTables: 16,
        playersCount: 32,
        maxPlayers: 2,
        stakeCredits: 75,
        minRank: 'Novice',
        difficulty: 'Casual',
        icon: Icons.spellcheck_rounded,
        accentColor: QuantColors.emeraldMatrix,
      ),
    ];
  }

  /// Games Lobby Leaderboard
  static List<GameLeaderboardEntry> getGameLeaderboard() {
    return const [
      GameLeaderboardEntry(
        rank: 1,
        username: 'GrandmasterVal',
        handle: '@val_master',
        creditsWon: 48500,
        winStreak: 19,
        avatarColor: QuantColors.moltenAmber,
        gameSpecialty: 'Speed Chess',
      ),
      GameLeaderboardEntry(
        rank: 2,
        username: 'AstraUnoChampion',
        handle: '@astra_uno',
        creditsWon: 39200,
        winStreak: 14,
        avatarColor: QuantColors.sovereignCyan,
        gameSpecialty: 'Sovereign Uno',
      ),
      GameLeaderboardEntry(
        rank: 3,
        username: 'TriviaOverlord',
        handle: '@trivia_overlord',
        creditsWon: 31800,
        winStreak: 11,
        avatarColor: QuantColors.emeraldMatrix,
        gameSpecialty: 'Quant Trivia Arena',
      ),
      GameLeaderboardEntry(
        rank: 4,
        username: 'WordCipher',
        handle: '@word_cipher',
        creditsWon: 24600,
        winStreak: 8,
        avatarColor: QuantColors.obsidianPurple,
        gameSpecialty: 'Word Duel Arena',
      ),
    ];
  }

  /// Default logged-in user profile
  static UserProfile getUserProfile() {
    return const UserProfile(
      name: 'Quant Sovereign',
      handle: '@quant_user',
      bio: 'Building and living on the Sovereign Quant Ecosystem. Zero Big Tech surveillance, hardware-accelerated 120Hz Impeller, decentralized social graph.',
      location: 'Sovereign Node #001',
      website: 'https://quantwave.in',
      joinDate: 'Joined October 2026',
      followingCount: 342,
      followersCount: 18900,
      karma: 45200,
      quantCredits: 12500,
      isVerified: true,
      avatarColor: QuantColors.moltenAmber,
    );
  }
}
