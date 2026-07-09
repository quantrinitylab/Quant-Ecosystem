import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AIEngine, createMemoryService, createInMemoryMemoryDb, UserStyleMemory } from '@quant/ai';
import { TypedQueue } from '@quant/queue';

// AI Services
import { AITriageService, TriageInputSchema } from '../services/ai-triage.service';
import { AIReplyService, ReplyInputSchema, ReplyOptionsSchema } from '../services/ai-reply.service';
import { AISummarizeService, ThreadMessageSchema } from '../services/ai-summarize.service';
import { AIComposeService, ComposeContextSchema } from '../services/ai-compose.service';
import { AIUnsubscribeService, EmailMetadataSchema } from '../services/ai-unsubscribe.service';
import {
  AIFollowupService,
  EmailInputSchema,
  MemoryBackedReminderStore,
} from '../services/ai-followup.service';
import {
  AIMeetingExtractService,
  MeetingEmailSchema,
} from '../services/ai-meeting-extract.service';
import { AIToneShiftService, ToneSchema } from '../services/ai-tone-shift.service';
import {
  AIAttachmentSummaryService,
  AttachmentMetadataSchema,
} from '../services/ai-attachment-summary.service';
import {
  AIContactContextService,
  MemoryBackedContactStore,
} from '../services/ai-contact-context.service';
import {
  SmartSendTimeService,
  RecipientPatternSchema,
  MemoryBackedPatternStore,
} from '../services/smart-send-time.service';
import {
  AIStyleLearnerService,
  SentEmailSchema,
  MemoryBackedStyleStore,
} from '../services/ai-style-learner.service';

// Infrastructure Services
import { EmailAliasesService } from '../services/email-aliases.service';
import { DisposableEmailService } from '../services/disposable-email.service';
import { TrackingPixelStripperService } from '../services/tracking-pixel-stripper.service';
import { PGPEncryptionService } from '../services/pgp-encryption.service';
import { UndoSendService, UndoSendJobSchema } from '../services/undo-send.service';

function getUserId(request: unknown): string {
  const req = request as { auth?: { userId?: string } };
  const userId = req.auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function aiServicesRoutes(fastify: FastifyInstance) {
  // Initialize AI services
  const engine = new AIEngine();

  // ─── Memory composition root (the ONE place backends are chosen) ────────
  // With DATABASE_URL the real Prisma client persists memories durably;
  // without it (dev/tests) the in-memory client keeps the SAME orchestration
  // path alive. Services only ever see ports.
  const memoryDb = process.env['DATABASE_URL']
    ? ((fastify as unknown as { prisma?: unknown }).prisma ?? createInMemoryMemoryDb())
    : createInMemoryMemoryDb();
  const memoryBackend = createMemoryService({ prisma: memoryDb as never });
  const styleChannel = new UserStyleMemory(memoryBackend);
  const triageService = new AITriageService(engine);
  const replyService = new AIReplyService(engine, styleChannel);
  const summarizeService = new AISummarizeService(engine);
  const composeService = new AIComposeService(engine);
  const unsubscribeService = new AIUnsubscribeService(engine);
  const followupService = new AIFollowupService(
    engine,
    new MemoryBackedReminderStore(memoryBackend),
  );
  const meetingService = new AIMeetingExtractService(engine);
  const toneService = new AIToneShiftService(engine);
  const attachmentService = new AIAttachmentSummaryService(engine);
  const contactService = new AIContactContextService(
    engine,
    new MemoryBackedContactStore(memoryBackend),
  );
  const sendTimeService = new SmartSendTimeService(
    engine,
    new MemoryBackedPatternStore(memoryBackend),
  );
  const styleService = new AIStyleLearnerService(engine, new MemoryBackedStyleStore(memoryBackend));

  // Initialize infrastructure services
  const aliasesService = new EmailAliasesService();
  const disposableService = new DisposableEmailService();
  const trackerService = new TrackingPixelStripperService();
  const pgpService = new PGPEncryptionService();

  const undoQueue = new TypedQueue('undo-send', UndoSendJobSchema, {
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['REDIS_PORT'] ?? 6379),
  });
  const undoService = new UndoSendService(undoQueue);

  // ==================== AI ROUTES ====================

  // POST /ai/triage
  fastify.post('/ai/triage', async (request, reply) => {
    const userId = getUserId(request);
    const body = TriageInputSchema.parse(request.body);
    const result = await triageService.triage(body, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/triage/batch
  const TriageBatchSchema = z.object({
    emails: z.array(TriageInputSchema).max(50),
  });
  fastify.post('/ai/triage/batch', async (request, reply) => {
    const userId = getUserId(request);
    const body = TriageBatchSchema.parse(request.body);
    const result = await triageService.triageBatch(body.emails, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/reply
  const ReplyBodySchema = z.object({
    email: ReplyInputSchema,
    options: ReplyOptionsSchema.optional(),
  });
  fastify.post('/ai/reply', async (request, reply) => {
    const userId = getUserId(request);
    const body = ReplyBodySchema.parse(request.body);
    const result = await replyService.draftReply(body.email, userId, body.options);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/summarize-thread
  const SummarizeThreadSchema = z.object({
    messages: z.array(ThreadMessageSchema),
  });
  fastify.post('/ai/summarize-thread', async (request, reply) => {
    const userId = getUserId(request);
    const body = SummarizeThreadSchema.parse(request.body);
    const result = await summarizeService.summarizeThread(body.messages, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/summarize
  const SummarizeSingleSchema = z.object({
    subject: z.string(),
    body: z.string(),
    from: z.string(),
  });
  fastify.post('/ai/summarize', async (request, reply) => {
    const userId = getUserId(request);
    const body = SummarizeSingleSchema.parse(request.body);
    const result = await summarizeService.summarizeSingle(body, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/compose
  const ComposeBodySchema = z.object({
    bullets: z.array(z.string()),
    context: ComposeContextSchema.optional(),
  });
  fastify.post('/ai/compose', async (request, reply) => {
    const userId = getUserId(request);
    const body = ComposeBodySchema.parse(request.body);
    const result = await composeService.composeFromBullets(
      body.bullets,
      body.context ?? {},
      userId,
    );
    return reply.send({ success: true, data: result });
  });

  // POST /ai/compose/improve
  const ImproveBodySchema = z.object({
    draft: z.string(),
    instructions: z.string(),
  });
  fastify.post('/ai/compose/improve', async (request, reply) => {
    const userId = getUserId(request);
    const body = ImproveBodySchema.parse(request.body);
    const result = await composeService.improveEmail(body.draft, body.instructions, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/unsubscribe/detect
  const UnsubscribeDetectSchema = z.object({
    emails: z.array(EmailMetadataSchema).max(50),
  });
  fastify.post('/ai/unsubscribe/detect', async (request, reply) => {
    const userId = getUserId(request);
    const body = UnsubscribeDetectSchema.parse(request.body);
    const result = await unsubscribeService.detectNewsletters(body.emails, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/unsubscribe/execute
  const UnsubscribeExecuteSchema = z.object({
    actions: z.array(
      z.object({
        emailId: z.string(),
        from: z.string(),
        method: z.enum(['link', 'header', 'reply']),
        unsubscribeUrl: z.string().optional(),
        status: z.enum(['pending', 'completed', 'failed']),
      }),
    ),
  });
  fastify.post('/ai/unsubscribe/execute', async (request, reply) => {
    const userId = getUserId(request);
    const body = UnsubscribeExecuteSchema.parse(request.body);
    const result = await unsubscribeService.executeBatchUnsubscribe(body.actions, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/followup/detect
  const FollowupDetectSchema = z.object({
    email: EmailInputSchema,
  });
  fastify.post('/ai/followup/detect', async (request, reply) => {
    const userId = getUserId(request);
    const body = FollowupDetectSchema.parse(request.body);
    const result = await followupService.detectCommitments(body.email, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/followup/reminders
  fastify.post('/ai/followup/reminders', async (request, reply) => {
    const userId = getUserId(request);
    const result = await followupService.getActiveReminders(userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/meeting-extract
  const MeetingExtractSchema = z.object({
    email: MeetingEmailSchema,
  });
  fastify.post('/ai/meeting-extract', async (request, reply) => {
    const userId = getUserId(request);
    const body = MeetingExtractSchema.parse(request.body);
    const result = await meetingService.extractMeetingDetails(body.email, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/tone-shift
  const ToneShiftSchema = z.object({
    emailText: z.string(),
    targetTone: ToneSchema,
  });
  fastify.post('/ai/tone-shift', async (request, reply) => {
    const userId = getUserId(request);
    const body = ToneShiftSchema.parse(request.body);
    const result = await toneService.shiftTone(body.emailText, body.targetTone, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/tone-shift/detect
  const ToneDetectSchema = z.object({
    emailText: z.string(),
  });
  fastify.post('/ai/tone-shift/detect', async (request, reply) => {
    const userId = getUserId(request);
    const body = ToneDetectSchema.parse(request.body);
    const result = await toneService.detectCurrentTone(body.emailText, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/attachment-summary
  const AttachmentSummaryBodySchema = z.object({
    attachment: AttachmentMetadataSchema,
  });
  fastify.post('/ai/attachment-summary', async (request, reply) => {
    const userId = getUserId(request);
    const body = AttachmentSummaryBodySchema.parse(request.body);
    const result = await attachmentService.summarizeAttachment(body.attachment, userId);
    return reply.send({ success: true, data: result });
  });

  // GET /ai/contact-context/:email
  fastify.get<{ Params: { email: string } }>(
    '/ai/contact-context/:email',
    async (request, reply) => {
      const userId = getUserId(request);
      const result = await contactService.getContactContext(request.params.email, userId);
      return reply.send({ success: true, data: result });
    },
  );

  // POST /ai/send-time
  const SendTimeSchema = z.object({
    recipientEmail: z.string(),
    engagementHistory: RecipientPatternSchema.optional(),
  });
  fastify.post('/ai/send-time', async (request, reply) => {
    const userId = getUserId(request);
    const body = SendTimeSchema.parse(request.body);
    const result = await sendTimeService.predictOptimalTime(
      body.recipientEmail,
      userId,
      body.engagementHistory,
    );
    return reply.send({ success: true, data: result });
  });

  // POST /ai/style/analyze
  const StyleAnalyzeSchema = z.object({
    sentEmails: z.array(SentEmailSchema),
  });
  fastify.post('/ai/style/analyze', async (request, reply) => {
    const userId = getUserId(request);
    const body = StyleAnalyzeSchema.parse(request.body);
    const result = await styleService.analyzeSentItems(body.sentEmails, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /ai/style/draft
  const StyleDraftSchema = z.object({
    content: z.string(),
  });
  fastify.post('/ai/style/draft', async (request, reply) => {
    const userId = getUserId(request);
    const body = StyleDraftSchema.parse(request.body);
    const result = await styleService.generateStyledDraft(body.content, userId);
    return reply.send({ success: true, data: result });
  });

  // ==================== INFRASTRUCTURE ROUTES ====================

  // POST /infra/aliases
  const CreateAliasSchema = z.object({
    alias: z.string().min(1),
    baseAddress: z.string().email(),
  });
  fastify.post('/infra/aliases', async (request, reply) => {
    const userId = getUserId(request);
    const body = CreateAliasSchema.parse(request.body);
    const result = aliasesService.createAlias(userId, body.alias, body.baseAddress);
    return reply.send({ success: true, data: result });
  });

  // GET /infra/aliases
  fastify.get('/infra/aliases', async (request, reply) => {
    const userId = getUserId(request);
    const result = aliasesService.listAliases(userId);
    return reply.send({ success: true, data: result });
  });

  // DELETE /infra/aliases/:id
  fastify.delete<{ Params: { id: string } }>('/infra/aliases/:id', async (request, reply) => {
    const userId = getUserId(request);
    const result = aliasesService.deleteAlias(userId, request.params.id);
    if (!result) {
      throw createAppError('Alias not found or not owned by user', 404, 'ALIAS_NOT_FOUND');
    }
    return reply.send({ success: true, data: { deleted: true } });
  });

  // POST /infra/disposable
  const CreateDisposableSchema = z.object({
    ttlMs: z.number().positive().optional(),
  });
  fastify.post('/infra/disposable', async (request, reply) => {
    const userId = getUserId(request);
    const body = CreateDisposableSchema.parse(request.body ?? {});
    const result = disposableService.createDisposable(userId, body.ttlMs);
    return reply.send({ success: true, data: result });
  });

  // GET /infra/disposable
  fastify.get('/infra/disposable', async (request, reply) => {
    const userId = getUserId(request);
    const result = disposableService.listActive(userId);
    return reply.send({ success: true, data: result });
  });

  // DELETE /infra/disposable/:address
  fastify.delete<{ Params: { address: string } }>(
    '/infra/disposable/:address',
    async (request, reply) => {
      const userId = getUserId(request);
      const result = disposableService.revokeDisposable(request.params.address, userId);
      if (!result) {
        throw createAppError(
          'Disposable email not found or not owned by user',
          404,
          'DISPOSABLE_NOT_FOUND',
        );
      }
      return reply.send({ success: true, data: { revoked: true } });
    },
  );

  // POST /infra/strip-trackers
  const StripTrackersSchema = z.object({
    htmlBody: z.string(),
  });
  fastify.post('/infra/strip-trackers', async (request, reply) => {
    getUserId(request);
    const body = StripTrackersSchema.parse(request.body);
    const result = trackerService.stripTrackers(body.htmlBody);
    return reply.send({ success: true, data: result });
  });

  // POST /infra/strip-trackers/report
  fastify.post('/infra/strip-trackers/report', async (request, reply) => {
    getUserId(request);
    const body = StripTrackersSchema.parse(request.body);
    const result = trackerService.getTrackerReport(body.htmlBody);
    return reply.send({ success: true, data: result });
  });

  // POST /infra/pgp/generate-keys
  const GenerateKeysSchema = z.object({
    passphrase: z.string().min(8),
  });
  fastify.post('/infra/pgp/generate-keys', async (request, reply) => {
    const userId = getUserId(request);
    const body = GenerateKeysSchema.parse(request.body);
    const result = await pgpService.generateKeyPair(userId, body.passphrase);
    return reply.send({ success: true, data: result });
  });

  // POST /infra/pgp/encrypt
  const EncryptSchema = z.object({
    message: z.string(),
    recipientPublicKey: z.string(),
  });
  fastify.post('/infra/pgp/encrypt', async (request, reply) => {
    const body = EncryptSchema.parse(request.body);
    const result = await pgpService.encrypt(body.message, body.recipientPublicKey);
    return reply.send({ success: true, data: { encrypted: result } });
  });

  // POST /infra/pgp/decrypt
  const DecryptSchema = z.object({
    encryptedMessage: z.string(),
    privateKey: z.string(),
    passphrase: z.string(),
  });
  fastify.post('/infra/pgp/decrypt', async (request, reply) => {
    const body = DecryptSchema.parse(request.body);
    const result = await pgpService.decrypt(
      body.encryptedMessage,
      body.privateKey,
      body.passphrase,
    );
    return reply.send({ success: true, data: { decrypted: result } });
  });

  // POST /infra/pgp/sign
  const SignSchema = z.object({
    message: z.string(),
    privateKey: z.string(),
    passphrase: z.string(),
  });
  fastify.post('/infra/pgp/sign', async (request, reply) => {
    const body = SignSchema.parse(request.body);
    const result = await pgpService.signMessage(body.message, body.privateKey, body.passphrase);
    return reply.send({ success: true, data: { signature: result } });
  });

  // POST /infra/pgp/verify
  const VerifySchema = z.object({
    message: z.string(),
    signature: z.string(),
    publicKey: z.string(),
  });
  fastify.post(
    '/infra/pgp/verify',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = VerifySchema.parse(request.body);
      const result = await pgpService.verifySignature(body.message, body.signature, body.publicKey);
      return reply.send({ success: true, data: { valid: result } });
    },
  );

  // POST /infra/undo-send
  const UndoSendSchema = z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
    delayMs: z.number().positive().optional(),
  });
  fastify.post('/infra/undo-send', async (request, reply) => {
    const userId = getUserId(request);
    const body = UndoSendSchema.parse(request.body);
    const result = await undoService.scheduleSend(
      { to: body.to, subject: body.subject, body: body.body },
      userId,
      body.delayMs,
    );
    return reply.send({ success: true, data: result });
  });

  // DELETE /infra/undo-send/:jobId
  fastify.delete<{ Params: { jobId: string } }>(
    '/infra/undo-send/:jobId',
    async (request, reply) => {
      const userId = getUserId(request);
      const result = await undoService.cancelSend(request.params.jobId, userId);
      return reply.send({ success: true, data: result });
    },
  );

  // GET /infra/undo-send/:jobId
  fastify.get<{ Params: { jobId: string } }>('/infra/undo-send/:jobId', async (request, reply) => {
    const userId = getUserId(request);
    const result = await undoService.getSendStatus(request.params.jobId, userId);
    return reply.send({ success: true, data: result });
  });
}

// Security: CodeQL #85: /infra/pgp/verify has an explicit per-route rate limit.
