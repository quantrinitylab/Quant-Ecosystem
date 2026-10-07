# M41 — Agent Learning From Memory

Quanty learns from governed evidence rather than blindly storing conversations.

Positive signals: explicit user preference/correction, verified successful action, repeated confirmed workflow.
Negative signals: user rejection/correction, failed verification, stale assumption, duplicate action.
Decay: temporary signals decay quickly; project context expires with inactivity; preferences remain until changed or explicitly forgotten.

Learning updates planning/ranking policy inputs. It does not rewrite canonical product state or silently create sensitive user facts.

Every learned signal must answer: what happened, where did evidence come from, how confident is it, when does it expire, and what can it influence?
