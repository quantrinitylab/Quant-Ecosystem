import * as crypto from 'crypto';

export interface EventCountdownState {
  eventId: string;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSecondsRemaining: number;
  status: 'UPCOMING' | 'LIVE' | 'ENDED';
}

export interface VirtualEventConfig {
  eventId: string;
  title: string;
  startTimeIso: string;
  endTimeIso: string;
  privateStreamUrl: string;
  allowEarlyJoinMinutes: number;
  isGateEnabled: boolean;
}

export interface AttendeeAccessPass {
  passId: string;
  eventId: string;
  attendeeId: string;
  token: string;
  expiresAt: number;
  isRevoked: boolean;
  issuedAt: string;
}

export interface StreamUnlockResult {
  allowed: boolean;
  streamUrl?: string;
  status: 'UNLOCKED' | 'NOT_STARTED_YET' | 'EVENT_ENDED' | 'PASS_REVOKED' | 'INVALID_PASS';
  reason?: string;
}

export class EventCountdownPassService {
  private events: Map<string, VirtualEventConfig> = new Map();
  private passes: Map<string, AttendeeAccessPass> = new Map();

  calculateCountdown(
    eventId: string,
    startTimeIso: string,
    endTimeIso: string,
    currentTimeIso?: string,
  ): EventCountdownState {
    const now = currentTimeIso ? new Date(currentTimeIso) : new Date();
    const start = new Date(startTimeIso);
    const end = new Date(endTimeIso);

    if (now < start) {
      const diffMs = start.getTime() - now.getTime();
      const totalSecondsRemaining = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSecondsRemaining / 86400);
      const hours = Math.floor((totalSecondsRemaining % 86400) / 3600);
      const minutes = Math.floor((totalSecondsRemaining % 3600) / 60);
      const seconds = totalSecondsRemaining % 60;

      return {
        eventId,
        days,
        hours,
        minutes,
        seconds,
        totalSecondsRemaining,
        status: 'UPCOMING',
      };
    } else if (now >= start && now <= end) {
      const diffMs = end.getTime() - now.getTime();
      const totalSecondsRemaining = Math.floor(diffMs / 1000);

      return {
        eventId,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSecondsRemaining,
        status: 'LIVE',
      };
    } else {
      return {
        eventId,
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        totalSecondsRemaining: 0,
        status: 'ENDED',
      };
    }
  }

  registerVirtualEvent(config: VirtualEventConfig): VirtualEventConfig {
    this.events.set(config.eventId, config);
    return config;
  }

  issueAccessPass(eventId: string, attendeeId: string, secretKey: string): AttendeeAccessPass {
    const event = this.events.get(eventId);
    if (!event) throw new Error(`Event ${eventId} not found`);

    const tokenPayload = `${eventId}:${attendeeId}`;
    const token = crypto.createHmac('sha256', secretKey).update(tokenPayload).digest('hex');
    const passId = crypto.randomUUID();
    const expiresAt = new Date(event.endTimeIso).getTime() + 60 * 60 * 1000; // 1 hour after end

    const pass: AttendeeAccessPass = {
      passId,
      eventId,
      attendeeId,
      token,
      expiresAt,
      isRevoked: false,
      issuedAt: new Date().toISOString(),
    };

    this.passes.set(passId, pass);
    return pass;
  }

  unlockPrivateStream(
    eventId: string,
    attendeeToken: string,
    secretKey: string,
    currentTimeIso?: string,
  ): StreamUnlockResult {
    const event = this.events.get(eventId);
    if (!event) return { allowed: false, status: 'INVALID_PASS', reason: 'Event not found' };

    let foundPass: AttendeeAccessPass | undefined;
    for (const p of this.passes.values()) {
      if (p.eventId === eventId && p.token === attendeeToken) {
        foundPass = p;
        break;
      }
    }

    if (!foundPass) {
      return { allowed: false, status: 'INVALID_PASS' };
    }

    const expectedToken = crypto
      .createHmac('sha256', secretKey)
      .update(`${foundPass.eventId}:${foundPass.attendeeId}`)
      .digest('hex');
    if (attendeeToken !== expectedToken) {
      return { allowed: false, status: 'INVALID_PASS' };
    }

    if (foundPass.isRevoked) {
      return { allowed: false, status: 'PASS_REVOKED' };
    }

    const now = currentTimeIso ? new Date(currentTimeIso) : new Date();
    const startWindow = new Date(event.startTimeIso);
    const allowEarlyJoinMs = event.allowEarlyJoinMinutes * 60 * 1000;
    const earlyJoinTime = new Date(startWindow.getTime() - allowEarlyJoinMs);
    const endTime = new Date(event.endTimeIso);

    if (now < earlyJoinTime) {
      return { allowed: false, status: 'NOT_STARTED_YET' };
    }

    if (now > endTime) {
      return { allowed: false, status: 'EVENT_ENDED' };
    }

    return {
      allowed: true,
      streamUrl: event.privateStreamUrl,
      status: 'UNLOCKED',
    };
  }

  revokeAccessPass(passId: string): boolean {
    const pass = this.passes.get(passId);
    if (pass) {
      pass.isRevoked = true;
      return true;
    }
    return false;
  }

  clearCountdownForTesting(): void {
    this.events.clear();
    this.passes.clear();
  }
}
