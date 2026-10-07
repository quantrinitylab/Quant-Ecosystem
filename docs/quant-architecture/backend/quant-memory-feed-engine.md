# Quant Personalized Feed Engine

## Architecture

Memory/context → candidate generation → safety/privacy eligibility → product policy → ranking → diversity → freshness/novelty → final feed.

## Candidate families

Followed entities, explicit interests, saved content, recent interactions, project context, time context, subscriptions, discovery candidates, and authorized temporary signals.

## Ranking controls

Relevance, freshness, affinity, quality, diversity, novelty, creator saturation, repetition limits, safety, and user personalization level.

## Mood/context adaptation

Temporary context can adjust candidate weights when confidence and policy permit. It must not become an authoritative diagnosis or durable sensitive profile by default.

## Feedback loop

Impression → view → dwell → like/save/share/hide/not interested → bounded model feedback. Avoid runaway reinforcement loops by enforcing exploration and diversity.

## Cross-product

QuantWave/QuantTube/QuantMax/etc. own their final ranking policies while consuming typed context from the shared memory/context platform.
