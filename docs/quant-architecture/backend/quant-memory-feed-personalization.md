# Quant Memory → Personalized Feed Architecture

## Principle

QuantDrive Memory provides context; each feed/product owns its ranking policy.

## Inputs

Authorized signals may include explicit interests, followed entities, recent interactions, saved items, active projects, content history, time context, and bounded temporary signals.

## Pipeline

User/context → candidate generation → policy/privacy filter → product-specific ranking → diversity/novelty → safety filter → final feed.

## Mood-aware personalization

The system may use temporary, uncertain behavioral signals to adjust recommendations when policy permits. It must not create or expose a definitive “mood” fact from weak signals.

Example: recent preference for calm content may increase calm-content candidates. It must not store “user is depressed” as a memory merely because of consumption behavior.

## Cross-product rule

The same memory substrate can inform QuantWave, QuantTube, QuantMax, QuantCooks, QuantGram, and other products, but each product controls candidate sources, ranking, safety, and user-facing controls.

## User controls

Provide personalization levels such as Personalized, Balanced, and Minimal where product design supports them. Respect global privacy/consent and product-specific opt-outs.
