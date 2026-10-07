# 13 — Backend and Service Inventory

Shared platform services:
Identity/Auth, Authorization/Policy, API Gateway, Event/Outbox, Realtime Gateway, Notifications, Search Indexer, Semantic Retrieval, Object Storage, AI Model Gateway, Quanty Agent Runtime, Memory, Knowledge Graph, Algorithm/Feature Platform, Trust/Safety, Moderation, Credits/Ledger, Billing, Experimentation, Audit, Observability, Feature Flags, Developer/CI, Media Transcoding, Ads Auction and Recommendation/Signal Projector.

Product domains:
QuantMail — auth, mailbox, message, thread, compose, search, contacts, calendar, drive, docs, git/codehub, notifications, admin.
QuantChat — conversation, message, channel, community, presence, call, meeting, media, moderation, admin.
QuantAI — conversation, model session, routing, agent, tool, plan, run, approval, memory, artifact, automation, usage, admin.
QuantGram — profile, follow, post, story, media, reaction, comment, feed, creator, moderation, analytics, admin.
QuantWave — profile, post, reply, community, follow, feed, trend, moderation, analytics, admin.
QuanTube — channel, video, audio, playlist, watch state, live, subscription, creator, monetization, transcoding, copyright, admin.
QuantMax — profile, discovery, preference, match, short video, live, safety, report, moderation, admin.
QuantCooks — project, asset, timeline, edit, generation, render, export, template, marketplace, creator, admin.
QuantAds — advertiser, campaign, creative, audience, bid, auction, spend, attribution, fraud, payout, billing, admin.

Do not create every component as a microservice on day one. Start with strong domain modules and extract services where scale, isolation, ownership or reliability requires it.