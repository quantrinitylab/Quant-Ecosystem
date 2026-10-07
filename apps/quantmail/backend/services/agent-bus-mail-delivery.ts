// ============================================================================
// Mail-domain adapter — EmailService-backed AgentEmailBus delivery (Phase 6)
// quantmail-superhub · Task 20.1 (Requirements 12.1, 12.4)
// ============================================================================
//
// PURPOSE
//   The Company OS `AgentEmailBus` (modules/company) delivers agent-to-agent
//   coordination mail through the NORMAL QuantMail pipeline via an injectable
//   `MailDeliveryPort` seam. Per the SRP boundary the company module does NOT
//   import the mail-domain services; instead the mail-domain side provides this
//   ADAPTER over `EmailService` + `ThreadService` and wires it at composition
//   time (dependency inversion). The port TYPES are imported type-only from the
//   company module barrel, so no runtime mail->company coupling is introduced.
//
//   WHAT THIS ADAPTER DOES (Req 12.1, 12.4)
//     • threads the message to the work item's bus `EmailThread` (creating one
//       via `ThreadService.stitchInbound` on the first message of an item);
//     • composes the message as a real `Email` owned by the org's tenant owner,
//       carrying the recipients (`toAddresses`) and the artifacts as
//       attachments;
//     • applies the reserved `agent-bus` system label so the orchestrator's
//       fleet manager can filter/observe the bus;
//     • optionally pushes the message through the durable outbound pipeline
//       (`EmailService.send`) when a Sent-folder resolver is supplied.
//
//   The structured `X-Quant-Agent-*` headers + the sender/recipient worker ids
//   are recorded by the bus itself in the `AgentBusEmailMeta` sidecar (the
//   `Email` model has no headers column), so this adapter is concerned only with
//   the durable, threaded, labelled mail delivery.

import type { EmailService } from './email.service';
import type { ThreadService } from './thread.service';
import type {
  MailDeliveryPort,
  DeliverBusMailInput,
  DeliveredBusMail,
} from '../modules/company';

/** Options for {@link EmailServiceMailDelivery}. */
export interface EmailServiceMailDeliveryOptions {
  /**
   * Resolves the Sent-folder id for an owner so a delivered bus message can be
   * pushed through the durable outbound pipeline (`EmailService.send`). When it
   * resolves `undefined` (or is omitted) the message is still composed, threaded
   * and labelled, but not enqueued for SMTP transmission (agent-to-agent mail is
   * internal, so the durable in-store thread is the delivery).
   */
  sentFolderResolver?: (ownerUserId: string) => Promise<string | undefined> | string | undefined;
}

/**
 * The production `MailDeliveryPort` adapter over the mail domain. Delivers an
 * agent-bus message as a real, threaded, `agent-bus`-labelled `Email`.
 */
export class EmailServiceMailDelivery implements MailDeliveryPort {
  constructor(
    private readonly emailService: EmailService,
    private readonly threadService: ThreadService,
    private readonly options: EmailServiceMailDeliveryOptions = {},
  ) {}

  async deliver(input: DeliverBusMailInput): Promise<DeliveredBusMail> {
    // ----- 1. Resolve/stitch the work item's bus thread (Req 12.1) ---------
    let threadId =
      typeof input.threadId === 'string' && input.threadId.length > 0
        ? input.threadId
        : undefined;
    if (!threadId) {
      threadId = await this.threadService.stitchInbound({
        userId: input.ownerUserId,
        subject: input.workItemTitle,
        participants: [input.fromAddress, ...input.toAddresses],
      });
    }

    // ----- 2. Compose the message as a real Email (Req 12.1, 12.4) ---------
    // Artifacts ride along as attachments; the message is threaded to the work
    // item. The Email is owned by the org's tenant owner.
    const email = await this.emailService.compose({
      userId: input.ownerUserId,
      toAddresses: input.toAddresses,
      subject: input.subject,
      bodyPlain: input.body,
      threadId,
      attachments: input.artifacts,
    });

    // ----- 3. Apply the reserved agent-bus system label --------------------
    await this.emailService.applyLabel(email.id, input.label, input.ownerUserId);

    // ----- 4. Optionally push through the durable outbound pipeline --------
    const sentFolderId = this.options.sentFolderResolver
      ? await this.options.sentFolderResolver(input.ownerUserId)
      : undefined;
    if (sentFolderId) {
      await this.emailService.send(input.ownerUserId, email.id, sentFolderId);
    }

    return { emailId: email.id, threadId: threadId ?? email.threadId ?? '' };
  }
}

/** Factory mirroring the other mail-domain service constructors. */
export function createEmailServiceMailDelivery(
  emailService: EmailService,
  threadService: ThreadService,
  options: EmailServiceMailDeliveryOptions = {},
): MailDeliveryPort {
  return new EmailServiceMailDelivery(emailService, threadService, options);
}
