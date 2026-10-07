# M41 — Typed Context Packages

A context package contains only what a task needs: intent, task type, authorized source refs, selected memories, live-source snapshots, graph relations, temporal constraints, uncertainty labels, redactions, context budget and policy version.

Example meeting-prep package = event + attendees + relevant mail + selected files + relevant Git work + user preferences. It excludes unrelated private memories.