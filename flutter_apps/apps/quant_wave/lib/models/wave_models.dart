// Sovereign Quant Ecosystem - QuantWave Domain Models
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';

/// Microblogging post model (X / Twitter parity)
class WavePost {
  final String id;
  final String authorName;
  final String authorHandle;
  final String authorInitials;
  final Color avatarColor;
  final bool isVerified;
  final String timestamp;
  final String content;
  final String? mediaUrl;
  final String? mediaType; // 'image', 'video'
  final int replyCount;
  final int repostCount;
  final int likeCount;
  final int bookmarkCount;
  final bool isLiked;
  final bool isReposted;
  final bool isBookmarked;
  final WavePoll? poll;

  const WavePost({
    required this.id,
    required this.authorName,
    required this.authorHandle,
    required this.authorInitials,
    required this.avatarColor,
    this.isVerified = false,
    required this.timestamp,
    required this.content,
    this.mediaUrl,
    this.mediaType,
    this.replyCount = 0,
    this.repostCount = 0,
    this.likeCount = 0,
    this.bookmarkCount = 0,
    this.isLiked = false,
    this.isReposted = false,
    this.isBookmarked = false,
    this.poll,
  });

  WavePost copyWith({
    String? id,
    String? authorName,
    String? authorHandle,
    String? authorInitials,
    Color? avatarColor,
    bool? isVerified,
    String? timestamp,
    String? content,
    String? mediaUrl,
    String? mediaType,
    int? replyCount,
    int? repostCount,
    int? likeCount,
    int? bookmarkCount,
    bool? isLiked,
    bool? isReposted,
    bool? isBookmarked,
    WavePoll? poll,
  }) {
    return WavePost(
      id: id ?? this.id,
      authorName: authorName ?? this.authorName,
      authorHandle: authorHandle ?? this.authorHandle,
      authorInitials: authorInitials ?? this.authorInitials,
      avatarColor: avatarColor ?? this.avatarColor,
      isVerified: isVerified ?? this.isVerified,
      timestamp: timestamp ?? this.timestamp,
      content: content ?? this.content,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      mediaType: mediaType ?? this.mediaType,
      replyCount: replyCount ?? this.replyCount,
      repostCount: repostCount ?? this.repostCount,
      likeCount: likeCount ?? this.likeCount,
      bookmarkCount: bookmarkCount ?? this.bookmarkCount,
      isLiked: isLiked ?? this.isLiked,
      isReposted: isReposted ?? this.isReposted,
      isBookmarked: isBookmarked ?? this.isBookmarked,
      poll: poll ?? this.poll,
    );
  }
}

/// Interactive Poll attached to a Wave Post
class WavePoll {
  final String id;
  final String question;
  final List<WavePollOption> options;
  final int totalVotes;
  final bool hasVoted;
  final int? selectedOptionIndex;

  const WavePoll({
    required this.id,
    required this.question,
    required this.options,
    required this.totalVotes,
    this.hasVoted = false,
    this.selectedOptionIndex,
  });

  WavePoll copyWith({
    String? id,
    String? question,
    List<WavePollOption>? options,
    int? totalVotes,
    bool? hasVoted,
    int? selectedOptionIndex,
  }) {
    return WavePoll(
      id: id ?? this.id,
      question: question ?? this.question,
      options: options ?? this.options,
      totalVotes: totalVotes ?? this.totalVotes,
      hasVoted: hasVoted ?? this.hasVoted,
      selectedOptionIndex: selectedOptionIndex ?? this.selectedOptionIndex,
    );
  }
}

/// Individual poll option with percentage calculation
class WavePollOption {
  final String id;
  final String text;
  final int voteCount;
  final double percentage;

  const WavePollOption({
    required this.id,
    required this.text,
    required this.voteCount,
    required this.percentage,
  });
}

/// Reddit-class Community Sub-Wave
class SubWaveCommunity {
  final String id;
  final String name; // e.g. w/tech
  final String title;
  final String description;
  final Color badgeColor;
  final int memberCount;
  final int onlineCount;
  final bool isJoined;
  final IconData icon;

  const SubWaveCommunity({
    required this.id,
    required this.name,
    required this.title,
    required this.description,
    required this.badgeColor,
    required this.memberCount,
    required this.onlineCount,
    this.isJoined = false,
    required this.icon,
  });

  SubWaveCommunity copyWith({
    String? id,
    String? name,
    String? title,
    String? description,
    Color? badgeColor,
    int? memberCount,
    int? onlineCount,
    bool? isJoined,
    IconData? icon,
  }) {
    return SubWaveCommunity(
      id: id ?? this.id,
      name: name ?? this.name,
      title: title ?? this.title,
      description: description ?? this.description,
      badgeColor: badgeColor ?? this.badgeColor,
      memberCount: memberCount ?? this.memberCount,
      onlineCount: onlineCount ?? this.onlineCount,
      isJoined: isJoined ?? this.isJoined,
      icon: icon ?? this.icon,
    );
  }
}

/// Reddit-class Sub-Wave Post
class SubWavePost {
  final String id;
  final String communityName;
  final String authorName;
  final String authorHandle;
  final String title;
  final String body;
  final int upvotes;
  final int downvotes;
  final int userVote; // 1 for upvoted, -1 for downvoted, 0 for none
  final int commentCount;
  final String tag;
  final String timeAgo;
  final List<SubWaveComment> comments;

  const SubWavePost({
    required this.id,
    required this.communityName,
    required this.authorName,
    required this.authorHandle,
    required this.title,
    required this.body,
    required this.upvotes,
    required this.downvotes,
    this.userVote = 0,
    required this.commentCount,
    required this.tag,
    required this.timeAgo,
    this.comments = const [],
  });

  int get score => upvotes - downvotes;

  SubWavePost copyWith({
    String? id,
    String? communityName,
    String? authorName,
    String? authorHandle,
    String? title,
    String? body,
    int? upvotes,
    int? downvotes,
    int? userVote,
    int? commentCount,
    String? tag,
    String? timeAgo,
    List<SubWaveComment>? comments,
  }) {
    return SubWavePost(
      id: id ?? this.id,
      communityName: communityName ?? this.communityName,
      authorName: authorName ?? this.authorName,
      authorHandle: authorHandle ?? this.authorHandle,
      title: title ?? this.title,
      body: body ?? this.body,
      upvotes: upvotes ?? this.upvotes,
      downvotes: downvotes ?? this.downvotes,
      userVote: userVote ?? this.userVote,
      commentCount: commentCount ?? this.commentCount,
      tag: tag ?? this.tag,
      timeAgo: timeAgo ?? this.timeAgo,
      comments: comments ?? this.comments,
    );
  }
}

/// Nested Reddit-style comments
class SubWaveComment {
  final String id;
  final String authorName;
  final String authorHandle;
  final String content;
  final int score;
  final String timeAgo;
  final int depth;
  final List<SubWaveComment> replies;

  const SubWaveComment({
    required this.id,
    required this.authorName,
    required this.authorHandle,
    required this.content,
    required this.score,
    required this.timeAgo,
    this.depth = 0,
    this.replies = const [],
  });
}

enum SubWaveSort {
  hot,
  newest,
  top,
  rising,
}

/// Live Audio Spaces Room (Twitter Spaces parity)
class WaveSpaceRoom {
  final String id;
  final String title;
  final String topic;
  final String hostName;
  final String hostHandle;
  final Color hostAvatarColor;
  final int listenerCount;
  final bool isLive;
  final String? scheduledTime;
  final List<SpaceSpeaker> speakers;
  final List<SpaceListener> listeners;

  const WaveSpaceRoom({
    required this.id,
    required this.title,
    required this.topic,
    required this.hostName,
    required this.hostHandle,
    required this.hostAvatarColor,
    required this.listenerCount,
    this.isLive = true,
    this.scheduledTime,
    this.speakers = const [],
    this.listeners = const [],
  });

  WaveSpaceRoom copyWith({
    String? id,
    String? title,
    String? topic,
    String? hostName,
    String? hostHandle,
    Color? hostAvatarColor,
    int? listenerCount,
    bool? isLive,
    String? scheduledTime,
    List<SpaceSpeaker>? speakers,
    List<SpaceListener>? listeners,
  }) {
    return WaveSpaceRoom(
      id: id ?? this.id,
      title: title ?? this.title,
      topic: topic ?? this.topic,
      hostName: hostName ?? this.hostName,
      hostHandle: hostHandle ?? this.hostHandle,
      hostAvatarColor: hostAvatarColor ?? this.hostAvatarColor,
      listenerCount: listenerCount ?? this.listenerCount,
      isLive: isLive ?? this.isLive,
      scheduledTime: scheduledTime ?? this.scheduledTime,
      speakers: speakers ?? this.speakers,
      listeners: listeners ?? this.listeners,
    );
  }
}

enum SpaceParticipantRole {
  host,
  coHost,
  speaker,
  listener,
}

class SpaceSpeaker {
  final String id;
  final String name;
  final String handle;
  final String initials;
  final SpaceParticipantRole role;
  final bool isSpeaking;
  final bool isMuted;
  final Color avatarColor;

  const SpaceSpeaker({
    required this.id,
    required this.name,
    required this.handle,
    required this.initials,
    required this.role,
    this.isSpeaking = false,
    this.isMuted = false,
    required this.avatarColor,
  });

  SpaceSpeaker copyWith({
    String? id,
    String? name,
    String? handle,
    String? initials,
    SpaceParticipantRole? role,
    bool? isSpeaking,
    bool? isMuted,
    Color? avatarColor,
  }) {
    return SpaceSpeaker(
      id: id ?? this.id,
      name: name ?? this.name,
      handle: handle ?? this.handle,
      initials: initials ?? this.initials,
      role: role ?? this.role,
      isSpeaking: isSpeaking ?? this.isSpeaking,
      isMuted: isMuted ?? this.isMuted,
      avatarColor: avatarColor ?? this.avatarColor,
    );
  }
}

class SpaceListener {
  final String id;
  final String name;
  final String handle;
  final String initials;
  final bool isHandRaised;
  final Color avatarColor;

  const SpaceListener({
    required this.id,
    required this.name,
    required this.handle,
    required this.initials,
    this.isHandRaised = false,
    required this.avatarColor,
  });

  SpaceListener copyWith({
    String? id,
    String? name,
    String? handle,
    String? initials,
    bool? isHandRaised,
    Color? avatarColor,
  }) {
    return SpaceListener(
      id: id ?? this.id,
      name: name ?? this.name,
      handle: handle ?? this.handle,
      initials: initials ?? this.initials,
      isHandRaised: isHandRaised ?? this.isHandRaised,
      avatarColor: avatarColor ?? this.avatarColor,
    );
  }
}

/// Interactive Party Games Lobby (Uno, Trivia, Chess, Word Arena)
class LobbyGame {
  final String id;
  final String title;
  final String category;
  final String description;
  final int activeTables;
  final int playersCount;
  final int maxPlayers;
  final int stakeCredits;
  final String minRank;
  final String difficulty;
  final IconData icon;
  final Color accentColor;

  const LobbyGame({
    required this.id,
    required this.title,
    required this.category,
    required this.description,
    required this.activeTables,
    required this.playersCount,
    required this.maxPlayers,
    required this.stakeCredits,
    required this.minRank,
    required this.difficulty,
    required this.icon,
    required this.accentColor,
  });
}

class GameLeaderboardEntry {
  final int rank;
  final String username;
  final String handle;
  final int creditsWon;
  final int winStreak;
  final Color avatarColor;
  final String gameSpecialty;

  const GameLeaderboardEntry({
    required this.rank,
    required this.username,
    required this.handle,
    required this.creditsWon,
    required this.winStreak,
    required this.avatarColor,
    required this.gameSpecialty,
  });
}

/// User profile model
class UserProfile {
  final String name;
  final String handle;
  final String bio;
  final String location;
  final String website;
  final String joinDate;
  final int followingCount;
  final int followersCount;
  final int karma;
  final int quantCredits;
  final bool isVerified;
  final Color avatarColor;

  const UserProfile({
    required this.name,
    required this.handle,
    required this.bio,
    required this.location,
    required this.website,
    required this.joinDate,
    required this.followingCount,
    required this.followersCount,
    required this.karma,
    required this.quantCredits,
    this.isVerified = true,
    required this.avatarColor,
  });
}
