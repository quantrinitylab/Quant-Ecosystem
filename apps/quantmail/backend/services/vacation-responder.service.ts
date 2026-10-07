import type { PrismaClient, VacationResponder, VacationAutoReplyLog } from '@prisma/client';
import { createAppError } from '@quant/server-core';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Sender-address fragments that indicate an automated / no-reply mailbox.
 * Auto-replying to these creates mail loops or bounces, so they are skipped.
 */
const AUTOMATED_SENDER_FRAGMENTS = ['no-reply', 'noreply', 'mailer-daemon', 'postmaster'];

export interface UpsertVacationResponderInput {
  enabled?: boolean;
  subject: string;
  message: string;
  startAt?: Date | null;
  endAt?: Date | null;
  onlyContacts?: boolean;
  intervalDays?: number;
}

export interface AutoReplyPayload {
  subject: string;
  message: string;
}

export class VacationResponderService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Returns the responder for a user, or null when none has been configured. */
  async getResponder(userId: string): Promise<VacationResponder | null> {
    return this.prisma.vacationResponder.findUnique({ where: { userId } });
  }

  /**
   * Creates or updates the user's vacation responder.
   * Validates the optional date window and the rate-limit interval.
   */
  async upsertResponder(
    userId: string,
    input: UpsertVacationResponderInput,
  ): Promise<VacationResponder> {
    if (
      input.startAt != null &&
      input.endAt != null &&
      input.startAt.getTime() >= input.endAt.getTime()
    ) {
      throw createAppError('startAt must be before endAt', 400, 'INVALID_DATE_RANGE');
    }

    if (input.intervalDays != null && input.intervalDays < 0) {
      throw createAppError('intervalDays must be zero or greater', 400, 'INVALID_INTERVAL');
    }

    const updateData: Record<string, unknown> = {
      subject: input.subject,
      message: input.message,
    };
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.startAt !== undefined) updateData.startAt = input.startAt;
    if (input.endAt !== undefined) updateData.endAt = input.endAt;
    if (input.onlyContacts !== undefined) updateData.onlyContacts = input.onlyContacts;
    if (input.intervalDays !== undefined) updateData.intervalDays = input.intervalDays;

    return this.prisma.vacationResponder.upsert({
      where: { userId },
      create: {
        userId,
        enabled: input.enabled ?? false,
        subject: input.subject,
        message: input.message,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        onlyContacts: input.onlyContacts ?? false,
        intervalDays: input.intervalDays ?? 1,
      },
      update: updateData,
    });
  }

  /** Toggles the responder on/off. Requires the responder to already exist. */
  async setEnabled(userId: string, enabled: boolean): Promise<VacationResponder> {
    const responder = await this.getResponder(userId);
    if (!responder) {
      throw createAppError('Vacation responder not found', 404, 'VACATION_RESPONDER_NOT_FOUND');
    }

    return this.prisma.vacationResponder.update({
      where: { userId },
      data: { enabled },
    });
  }

  /**
   * Determines whether an automatic reply should be sent to `fromAddress` right now.
   *
   * Returns true only when ALL of the following hold:
   *  - the responder exists and is enabled
   *  - `now` falls inside the [startAt, endAt] window (null bounds are open)
   *  - either onlyContacts is off, or the sender is a known contact
   *  - no auto-reply has been sent to this sender within intervalDays
   *  - the sender does not look like an automated / no-reply mailbox
   */
  async shouldAutoReply(userId: string, fromAddress: string, now: Date): Promise<boolean> {
    if (this.isAutomatedSender(fromAddress)) {
      return false;
    }

    const responder = await this.getResponder(userId);
    if (!responder || !responder.enabled) {
      return false;
    }

    if (responder.startAt != null && now.getTime() < responder.startAt.getTime()) {
      return false;
    }
    if (responder.endAt != null && now.getTime() > responder.endAt.getTime()) {
      return false;
    }

    if (responder.onlyContacts) {
      const contact = await this.prisma.contact.findFirst({
        where: { userId, email: fromAddress },
      });
      if (!contact) {
        return false;
      }
    }

    const lastLog = await this.prisma.vacationAutoReplyLog.findFirst({
      where: { userId, toAddress: fromAddress },
    });
    if (lastLog) {
      const intervalMs = responder.intervalDays * MS_PER_DAY;
      const elapsed = now.getTime() - lastLog.repliedAt.getTime();
      if (elapsed < intervalMs) {
        return false;
      }
    }

    return true;
  }

  /** Records (idempotently) that an auto-reply was sent to `toAddress` at `now`. */
  async recordAutoReply(
    userId: string,
    toAddress: string,
    now: Date,
  ): Promise<VacationAutoReplyLog> {
    return this.prisma.vacationAutoReplyLog.upsert({
      where: { userId_toAddress: { userId, toAddress } },
      create: { userId, toAddress, repliedAt: now },
      update: { repliedAt: now },
    });
  }

  /**
   * High-level helper: if an auto-reply is warranted, records it (idempotent upsert)
   * and returns the responder's subject/message. Otherwise returns null.
   */
  async buildAutoReply(
    userId: string,
    fromAddress: string,
    now: Date,
  ): Promise<AutoReplyPayload | null> {
    const shouldReply = await this.shouldAutoReply(userId, fromAddress, now);
    if (!shouldReply) {
      return null;
    }

    await this.recordAutoReply(userId, fromAddress, now);

    const responder = await this.getResponder(userId);
    if (!responder) {
      return null;
    }

    return { subject: responder.subject, message: responder.message };
  }

  /** True when the address is empty or matches a known automated-mailbox fragment. */
  private isAutomatedSender(fromAddress: string): boolean {
    const normalized = fromAddress.trim().toLowerCase();
    if (normalized.length === 0) {
      return true;
    }
    return AUTOMATED_SENDER_FRAGMENTS.some((fragment) => normalized.includes(fragment));
  }
}
