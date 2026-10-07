# Quant Cross-Product Memory Context Contracts

## Principle

Products request typed context, not unrestricted memory access.

## Mail request example

Needs: participant context, thread history summary, related calendar event, relevant files, user writing preference. Does not need arbitrary media consumption history.

## Calendar request example

Needs: scheduling preferences, participant context, relevant prior meeting, current availability. Does not need unrelated private conversations.

## Drive request example

Needs: related project, collaborators, file history, relevant task context. Does not need unrelated feed behavior.

## Feed request example

Needs: explicit interests, followed entities, recent interactions, saved content, bounded temporary recommendation signals. It must not receive raw private email bodies merely for personalization.

## Git request example

Needs: repositories, project context, coding preferences, related tasks, authorized developer activity.

## Contract fields

contextType, purpose, requiredMemoryTypes, allowedSourceProducts, sensitivityCeiling, maxItems, ttl, redactionPolicy, userControls, auditClass.
