# 25 — Quanty Voice Agent and Conversation Architecture

## Goal
Make “Quanty…” followed by natural speech a reliable, interruptible, context-aware conversation rather than push-to-talk transcription.

## Voice pipeline
Microphone → platform audio session → echo cancellation/noise suppression → VAD → streaming ASR → partial transcript → turn finalization → intent/context → planner → response/action → streaming TTS → speaker output. Barge-in immediately stops TTS and returns to listening.

## Listening contract
The live session has explicit states and visible indicators. “Quanty” can wake a session where platform policy permits; tapping the Quanty voice control is always available. The session does not secretly listen after it ends. Audio retention follows the product privacy policy and user controls.

## Speech correctness
ASR confidence, entity confidence and command risk are separate. Low confidence on a harmless query may produce a clarification. Low confidence on a recipient, amount, destructive action or external side effect must not silently execute. Critical entities are restated before confirmation.

## Natural dialogue
Quanty supports follow-up references such as “haan”, “isko”, “kal wala”, “usko bhejo” using the active task context. Ambiguous references produce a targeted clarification. Context expires according to task/session policy; unrelated old conversations are not silently reused.

## UI
Mobile voice mode uses the Quanty live capsule near the camera/island area where platform UI permits, with a larger bottom-sheet/immersive mode for transcript, current action, confirmation and task progress. Web uses a floating capsule that can dock to the edge. Tauri/desktop supports compact floating and full panel modes. Accessibility provides text transcript, keyboard controls, captions, reduced motion and explicit mic state.

## Voice tool contract
Voice tools return user-facing progress phrases, action status, confirmation requirements and verification evidence. Agents never synthesize fake progress.

## Safety
Wake words never bypass permissions. Voice cannot authorize an action that the signed-in user could not perform through UI. Sensitive actions require the same or stronger authorization than touch interaction.

## Implementation
VOICE-01 audio session; VOICE-02 VAD; VOICE-03 streaming ASR; VOICE-04 dialogue turns; VOICE-05 barge-in; VOICE-06 TTS; VOICE-07 confidence/clarification; VOICE-08 confirmation; VOICE-09 transcript/accessibility; VOICE-10 platform adapters; VOICE-11 latency/evaluation; VOICE-12 privacy/retention tests.
