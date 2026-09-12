import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { CallService } from './call.service';
import { VoiceBotAgentService, type VoiceBotTurn, type TTSResult } from './voice-bot-agent.service';
import {
  MeetingReminderDialogueService,
  type MeetingReminderContext,
  type DialogueTurnResult,
} from './meeting-reminder-dialogue.service';

export interface RingCallPayload {
  userId: string;
  meetingId: string;
  title: string;
  organizer: string;
  startTime: string | Date;
  minutesUntilStart: number;
  userName?: string;
  locale?: 'en' | 'hi' | 'hinglish';
  joinUrl?: string;
}

export type OutboundCallState =
  | 'ringing'
  | 'answered'
  | 'declined'
  | 'missed'
  | 'in-progress'
  | 'completed';

export interface ActiveOutboundCall {
  callId: string;
  roomName: string;
  userId: string;
  botIdentity: string;
  state: OutboundCallState;
  context: MeetingReminderContext;
  userToken: string;
  botToken: string;
  voiceSessionId?: string;
  ringStartedAt: number;
  ringTimeoutTimer?: NodeJS.Timeout;
  answeredAt?: number;
  endedAt?: number;
  lastDialogueResult?: DialogueTurnResult;
}

export interface RealtimeBroadcaster {
  publish(event: string, payload: Record<string, unknown>): Promise<void> | void;
}

export interface CallRingGeneratorOptions {
  callService: CallService;
  voiceBot: VoiceBotAgentService;
  dialogueService?: MeetingReminderDialogueService;
  broadcaster?: RealtimeBroadcaster;
  ringTimeoutMs?: number;
}

export class CallRingGeneratorService {
  private readonly callService: CallService;
  private readonly voiceBot: VoiceBotAgentService;
  private readonly dialogue: MeetingReminderDialogueService;
  private readonly broadcaster?: RealtimeBroadcaster;
  private readonly ringTimeoutMs: number;
  private readonly activeCalls = new Map<string, ActiveOutboundCall>();

  constructor(options: CallRingGeneratorOptions) {
    this.callService = options.callService;
    this.voiceBot = options.voiceBot;
    this.dialogue = options.dialogueService || new MeetingReminderDialogueService();
    this.broadcaster = options.broadcaster;
    this.ringTimeoutMs = options.ringTimeoutMs || 30_000;
  }

  /**
   * Generates an outbound call alert for a meeting reminder.
   * Rings the user's connected clients and sets up room tokens.
   */
  async triggerMeetingCallAlert(payload: RingCallPayload): Promise<ActiveOutboundCall> {
    const callInfo = await this.callService.initiate1v1Call('quanty-voice-bot', payload.userId);

    const userToken = await this.callService.generateCallToken(callInfo.callId, payload.userId);
    const botToken = await this.voiceBot.generateBotToken(callInfo.roomName);

    const context: MeetingReminderContext = {
      meetingId: payload.meetingId,
      title: payload.title,
      organizer: payload.organizer,
      startTime: payload.startTime,
      minutesUntilStart: payload.minutesUntilStart,
      userName: payload.userName,
      locale: payload.locale || 'hinglish',
      joinUrl: payload.joinUrl,
    };

    const activeCall: ActiveOutboundCall = {
      callId: callInfo.callId,
      roomName: callInfo.roomName,
      userId: payload.userId,
      botIdentity: 'quanty-voice-bot',
      state: 'ringing',
      context,
      userToken,
      botToken,
      ringStartedAt: Date.now(),
    };

    // Set up auto-ring timeout
    activeCall.ringTimeoutTimer = setTimeout(() => {
      this.handleRingTimeout(callInfo.callId);
    }, this.ringTimeoutMs);

    this.activeCalls.set(callInfo.callId, activeCall);

    // Notify user clients of incoming call ring via WebSocket backplane
    if (this.broadcaster) {
      await this.broadcaster.publish(`user:${payload.userId}:call_ring`, {
        callId: callInfo.callId,
        roomName: callInfo.roomName,
        caller: 'Quanty AI Assistant',
        callType: 'voice_meeting_reminder',
        meetingTitle: payload.title,
        userToken,
      });
    }

    return activeCall;
  }

  /**
   * Called when user picks up / answers the incoming call.
   */
  async answerCall(
    callId: string,
    userId: string,
  ): Promise<{
    call: ActiveOutboundCall;
    greetingText: string;
    greetingAudio: TTSResult;
  }> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }
    if (call.userId !== userId) {
      throw createAppError('User not authorized for this call', 403, 'FORBIDDEN');
    }
    if (call.state !== 'ringing') {
      throw createAppError(`Call is already in state '${call.state}'`, 400, 'INVALID_STATE');
    }

    if (call.ringTimeoutTimer) {
      clearTimeout(call.ringTimeoutTimer);
      call.ringTimeoutTimer = undefined;
    }

    call.state = 'in-progress';
    call.answeredAt = Date.now();

    // Start voice bot session in the room
    const session = this.voiceBot.createSession(call.roomName, userId, {
      callId,
      meetingId: call.context.meetingId,
    });
    call.voiceSessionId = session.sessionId;

    // Generate opening reminder greeting
    const greetingText = this.dialogue.generateOpeningGreeting(call.context);
    const { tts } = await this.voiceBot.speak(session.sessionId, greetingText);

    return {
      call,
      greetingText,
      greetingAudio: tts,
    };
  }

  /**
   * Called when user declines the incoming call.
   */
  async declineCall(callId: string, userId: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw createAppError('Call not found', 404, 'CALL_NOT_FOUND');
    }
    if (call.userId !== userId) {
      throw createAppError('User not authorized for this call', 403, 'FORBIDDEN');
    }

    if (call.ringTimeoutTimer) {
      clearTimeout(call.ringTimeoutTimer);
      call.ringTimeoutTimer = undefined;
    }

    call.state = 'declined';
    call.endedAt = Date.now();

    await this.callService.endCall(callId);
  }

  /**
   * Handles user speaking during the call and runs conversational dialogue engine.
   */
  async processDialogueTurn(
    callId: string,
    userText: string,
  ): Promise<{
    dialogueResult: DialogueTurnResult;
    botSpeech: string;
    botAudio: TTSResult;
    turn: VoiceBotTurn;
  }> {
    const call = this.activeCalls.get(callId);
    if (!call || !call.voiceSessionId) {
      throw createAppError('Active call or session not found', 404, 'CALL_NOT_FOUND');
    }

    // Record user utterance
    this.voiceBot.recordUserTextTurn(call.voiceSessionId, userText);

    // Evaluate turn
    const dialogueResult = this.dialogue.handleUserResponse(userText, call.context);
    call.lastDialogueResult = dialogueResult;

    // Voice bot speaks resolution
    const { tts, turn } = await this.voiceBot.speak(call.voiceSessionId, dialogueResult.speechText);

    if (dialogueResult.shouldEndCall) {
      call.state = 'completed';
      call.endedAt = Date.now();
      await this.voiceBot.endSession(call.voiceSessionId);
      await this.callService.endCall(callId);
    }

    return {
      dialogueResult,
      botSpeech: dialogueResult.speechText,
      botAudio: tts,
      turn,
    };
  }

  getCall(callId: string): ActiveOutboundCall | undefined {
    return this.activeCalls.get(callId);
  }

  private handleRingTimeout(callId: string) {
    const call = this.activeCalls.get(callId);
    if (call && call.state === 'ringing') {
      call.state = 'missed';
      call.endedAt = Date.now();
      this.callService.endCall(callId).catch(() => {});
    }
  }
}
