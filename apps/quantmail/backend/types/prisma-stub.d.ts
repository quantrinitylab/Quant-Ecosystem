/**
 * Dev-time Prisma stub for QuantMail backend.
 * This file provides type definitions for @prisma/client when no real Prisma
 * generation has been run. It is scoped to the quantmail tsconfig.backend.json
 * compilation unit only. Once a real Prisma schema is generated, remove this
 * file and use the generated client types instead.
 */
declare module '@prisma/client' {
  export interface Email {
    id: string;
    userId: string;
    folderId: string | null;
    fromAddress: string;
    fromName: string | null;
    toAddresses: string[];
    ccAddresses: string[];
    bccAddresses: string[];
    subject: string;
    bodyHtml: string;
    bodyPlain: string;
    snippet: string;
    threadId: string | null;
    inReplyTo: string | null;
    hasAttachments: boolean;
    attachments: unknown[];
    isRead: boolean;
    isStarred: boolean;
    isDraft: boolean;
    isSent: boolean;
    isTrash: boolean;
    receivedAt: Date;
    sentAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface EmailThread {
    id: string;
    userId: string;
    subject: string;
    participantAddresses: string[];
    messageCount: number;
    isRead: boolean;
    isStarred: boolean;
    isMuted: boolean;
    snoozedUntil: Date | null;
    lastEmailAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface EmailFolder {
    id: string;
    userId: string;
    name: string;
    type: string;
    parentId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface Repository {
    id: string;
    ownerId: string;
    name: string;
    description: string | null;
    visibility: string;
    defaultBranch: string;
    storagePathUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface PullRequest {
    id: string;
    repoId: string;
    number: number;
    title: string;
    body: string | null;
    authorId: string;
    status: string;
    sourceBranch: string;
    targetBranch: string;
    mergeStrategy: string | null;
    mergedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface Issue {
    id: string;
    repoId: string;
    number: number;
    title: string;
    body: string | null;
    authorId: string;
    status: string;
    labels: string[];
    assignees: string[];
    createdAt: Date;
    updatedAt: Date;
    closedAt: Date | null;
  }

  export interface Review {
    id: string;
    prId: string;
    reviewerId: string;
    status: string;
    body: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface ReviewComment {
    id: string;
    reviewId: string;
    prId: string;
    authorId: string;
    body: string;
    filePath: string;
    line: number;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface BranchProtection {
    id: string;
    repoId: string;
    branchPattern: string;
    requiredApprovals: number;
    requireStatusChecks: boolean;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface CiRun {
    id: string;
    repoId: string;
    prId: string | null;
    branch: string;
    commitSha: string;
    status: string;
    triggeredBy: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface CiJob {
    id: string;
    runId: string;
    name: string;
    status: string;
    logs: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface Branch {
    id: string;
    repoId: string;
    name: string;
    sha: string;
    commitSha: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface Contact {
    id: string;
    userId: string;
    name: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface ContactGroup {
    id: string;
    userId: string;
    name: string;
    emails: string[];
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface Label {
    id: string;
    userId: string;
    name: string;
    color: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface MailFilter {
    id: string;
    userId: string;
    name: string;
    enabled: boolean;
    priority: number;
    matchAll: boolean;
    conditions: unknown;
    actions: unknown;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface VacationResponder {
    id: string;
    userId: string;
    enabled: boolean;
    subject: string;
    message: string;
    startAt: Date | null;
    endAt: Date | null;
    onlyContacts: boolean;
    intervalDays: number;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface VacationAutoReplyLog {
    id: string;
    userId: string;
    toAddress: string;
    repliedAt: Date;
  }

  export interface EmailTemplate {
    id: string;
    userId: string;
    name: string;
    subject: string;
    bodyHtml: string;
    shortcut: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface EmailSignature {
    id: string;
    userId: string;
    name: string;
    contentHtml: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface AgentSession {
    id: string;
    userId: string;
    repoId: string;
    instruction: string;
    status: string;
    branchRef: string;
    maxIterations: number;
    iterationCount: number;
    costBudget: number;
    costSpent: number;
    linkedPrId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface AgentTranscript {
    id: string;
    sessionId: string;
    seq: number;
    role: string;
    toolName: string | null;
    payload: unknown;
    tokensUsed: number;
    timestamp: Date;
  }

  // Company OS (Phase 6) — quantmail-superhub Task 18.1 (Requirements 9.1–9.4).
  export interface User {
    id: string;
    email: string;
    username: string;
    displayName: string;
    role: string;
    status: string;
    emailVerified: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface AgentOrg {
    id: string;
    ceoUserId: string;
    tenantId: string;
    goalText: string;
    status: string;
    workspaceRepoId: string | null;
    budgetCap: number;
    costSpent: number;
    maxIterations: number;
    totalIterations: number;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface AgentWorker {
    id: string;
    orgId: string;
    tenantId: string;
    role: string;
    modelRef: string;
    mailboxIdentityId: string | null;
    toolScope: unknown;
    status: string;
    budgetShare: number;
    costSpent: number;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface AgentMailboxIdentity {
    id: string;
    orgId: string;
    tenantId: string;
    workerSlot: string;
    roleKey: string | null;
    address: string;
    scopes: unknown;
    status: string;
    revokedAt: Date | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface DocumentChunk {
    id: string;
    userId: string;
    sourceType: string;
    sourceRef: unknown;
    text: string;
    embeddingId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  // Agent action audit + approval gating (Phase 6) —
  // quantmail-superhub Task 22.1 (Requirements 14.1, 14.2, 14.3, 23.1, 23.3).
  export interface AgentActionAudit {
    id: string;
    tenantId: string;
    orgId: string | null;
    actorWorkerId: string | null;
    actionType: string;
    targetRef: string;
    sensitivity: string;
    status: string;
    approvedByHuman: boolean;
    approvedByUserId: string | null;
    requestedAt: Date;
    decidedAt: Date | null;
    executedAt: Date | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }

  // Agent Email Bus (Phase 6) — quantmail-superhub Task 20.1
  // (Requirements 12.1, 12.2, 12.3, 12.4).
  export interface AgentWorkItem {
    id: string;
    orgId: string;
    assignedWorkerId: string | null;
    busThreadId: string | null;
    title: string;
    spec: string | null;
    status: string;
    linkedSessionId: string | null;
    linkedPrId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface AgentBusEmailMeta {
    id: string;
    emailId: string;
    orgId: string;
    threadId: string;
    workItemId: string;
    fromWorkerId: string;
    fromRole: string;
    toWorkerIds: unknown;
    msgType: string;
    label: string;
    headers: unknown;
    artifacts: unknown;
    createdAt: Date;
  }

  // Billing / Credits (Phase 7) — quantmail-superhub Task 25.1
  // (Requirements 16.1-16.5). Append-only, immutable ledger; the authoritative
  // wallet balance is derived as SUM(amount) over an owner's entries.
  export interface CreditLedgerEntry {
    id: string;
    ownerRef: string;
    ownerType: string;
    tenantId: string | null;
    entryType: string;
    bucket: string;
    amount: number;
    actionKey: string | null;
    sourceRef: string | null;
    utcDay: string | null;
    reason: string | null;
    createdAt: Date;
  }

  // Plans / entitlements (Phase 7) — quantmail-superhub Task 28.1
  // (Requirements 19.1-19.4). Records WHICH tier an owner is on plus the
  // lifecycle of any scheduled change; the tier entitlements themselves are
  // code constants in the billing module's static plan catalog.
  export interface PlanSubscription {
    id: string;
    ownerRef: string;
    ownerType: string;
    tenantId: string | null;
    planTier: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    pendingPlanTier: string | null;
    effectiveAt: Date | null;
    providerSubId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  // Payments / webhooks (Phase 7) — quantmail-superhub Task 29.1
  // (Requirements 20.1-20.5). Tracks a single provider-hosted payment intent;
  // NO card data is stored. `providerEventId` is the at-most-once webhook key
  // (Req 20.3) and is unique (nullable until the signed event arrives).
  export interface PaymentRecord {
    id: string;
    ownerRef: string;
    ownerType: string;
    tenantId: string | null;
    providerEventId: string | null;
    providerSessionId: string | null;
    providerSubId: string | null;
    kind: string;
    status: string;
    amountCredits: number | null;
    planTier: string | null;
    createdAt: Date;
    updatedAt: Date;
  }

  interface WhereUniqueInput {
    id?: string;
    [key: string]: unknown;
  }

  interface WhereInput {
    [key: string]: unknown;
  }

  interface OrderByInput {
    [key: string]: 'asc' | 'desc' | OrderByInput;
  }

  interface FindManyArgs {
    where?: WhereInput;
    skip?: number;
    take?: number;
    orderBy?: OrderByInput | OrderByInput[];
    include?: Record<string, boolean | Record<string, unknown>>;
    select?: Record<string, boolean | Record<string, unknown>>;
    distinct?: string[];
  }

  interface FindFirstArgs {
    where?: WhereInput;
    orderBy?: OrderByInput | OrderByInput[];
    include?: Record<string, boolean | Record<string, unknown>>;
  }

  interface CreateArgs {
    data: Record<string, unknown>;
  }

  interface CreateManyArgs {
    data: Record<string, unknown>[];
  }

  interface UpdateArgs {
    where: WhereUniqueInput;
    data: Record<string, unknown>;
  }

  interface UpdateManyArgs {
    where: WhereInput;
    data: Record<string, unknown>;
  }

  interface DeleteArgs {
    where: WhereUniqueInput;
  }

  interface UpsertArgs {
    where: WhereUniqueInput;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }

  interface CountArgs {
    where?: WhereInput;
  }

  interface ModelDelegate<T> {
    findUnique(args: {
      where: WhereUniqueInput;
      include?: Record<string, unknown>;
    }): Promise<T | null>;
    findFirst(args?: FindFirstArgs): Promise<T | null>;
    findMany(args?: FindManyArgs): Promise<T[]>;
    create(args: CreateArgs): Promise<T>;
    createMany(args: CreateManyArgs): Promise<{ count: number }>;
    update(args: UpdateArgs): Promise<T>;
    updateMany(args: UpdateManyArgs): Promise<{ count: number }>;
    upsert(args: UpsertArgs): Promise<T>;
    delete(args: DeleteArgs): Promise<T>;
    count(args?: CountArgs): Promise<number>;
  }

  export interface PrismaClient {
    email: ModelDelegate<Email>;
    emailThread: ModelDelegate<EmailThread>;
    emailFolder: ModelDelegate<EmailFolder>;
    repository: ModelDelegate<Repository>;
    pullRequest: ModelDelegate<PullRequest>;
    issue: ModelDelegate<Issue>;
    review: ModelDelegate<Review>;
    reviewComment: ModelDelegate<ReviewComment>;
    branchProtection: ModelDelegate<BranchProtection>;
    ciRun: ModelDelegate<CiRun>;
    ciJob: ModelDelegate<CiJob>;
    branch: ModelDelegate<Branch>;
    contact: ModelDelegate<Contact>;
    contactGroup: ModelDelegate<ContactGroup>;
    label: ModelDelegate<Label>;
    mailFilter: ModelDelegate<MailFilter>;
    vacationResponder: ModelDelegate<VacationResponder>;
    vacationAutoReplyLog: ModelDelegate<VacationAutoReplyLog>;
    emailTemplate: ModelDelegate<EmailTemplate>;
    emailSignature: ModelDelegate<EmailSignature>;
    agentSession: ModelDelegate<AgentSession>;
    agentTranscript: ModelDelegate<AgentTranscript>;
    agentOrg: ModelDelegate<AgentOrg>;
    agentWorker: ModelDelegate<AgentWorker>;
    agentMailboxIdentity: ModelDelegate<AgentMailboxIdentity>;
    user: ModelDelegate<User>;
    documentChunk: ModelDelegate<DocumentChunk>;
    agentWorkItem: ModelDelegate<AgentWorkItem>;
    agentBusEmailMeta: ModelDelegate<AgentBusEmailMeta>;
    agentActionAudit: ModelDelegate<AgentActionAudit>;
    creditLedgerEntry: ModelDelegate<CreditLedgerEntry>;
    planSubscription: ModelDelegate<PlanSubscription>;
    paymentRecord: ModelDelegate<PaymentRecord>;
    $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T>;
  }
}
