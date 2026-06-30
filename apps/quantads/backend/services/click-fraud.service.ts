// ============================================================================
// QuantAds - Click-fraud detection service (durable, heuristic)
// ============================================================================
//
// Every click on the serving surface is assessed and recorded durably as an
// AdClickEvent with a fraud verdict. Only `billable` clicks (not flagged) charge
// the advertiser and count toward publisher payouts. Heuristics (pure, no
// external service — fully sandbox-verifiable):
//
//   • DEDUP    — the same (userId, adId) clicked again within a short window is
//                a double-count, not a new billable click.
//   • VELOCITY — too many clicks from one user OR one IP within a window is
//                inorganic (bot / click farm) and is flagged non-billable.
//
// IPs are stored only as a salted SHA-256 hash (never raw). The service depends
// on a structural Prisma slice so it is unit-testable with a fake.

import { createHash } from 'node:crypto';

export interface AdClickEventRow {
  id: string;
  adId: string;
  campaignId: string | null;
  userId: string;
  ipHash: string | null;
  deviceFp: string | null;
  billable: boolean;
  fraudFlag: boolean;
  fraudReason: string | null;
  createdAt: Date | string;
}

/** Structural Prisma slice the service needs (real PrismaClient satisfies it). */
export interface ClickFraudPrisma {
  adClickEvent: {
    findMany(args: { where?: Record<string, unknown> }): Promise<AdClickEventRow[]>;
    create(args: { data: Record<string, unknown> }): Promise<AdClickEventRow>;
  };
}

export interface ClickAssessmentInput {
  adId: string;
  campaignId?: string | null;
  userId: string;
  ip?: string | undefined;
  deviceFp?: string | undefined;
}

export interface ClickVerdict {
  /** True when the click charges the advertiser / counts toward payouts. */
  billable: boolean;
  fraudFlag: boolean;
  fraudReason?: string;
  /** The persisted event id. */
  eventId: string;
}

export interface ClickFraudOptions {
  /** Window for treating a repeat (userId, adId) click as a duplicate. */
  dedupWindowMs?: number;
  /** Window over which click velocity is measured. */
  velocityWindowMs?: number;
  /** Max billable clicks per user within the velocity window. */
  maxClicksPerUser?: number;
  /** Max billable clicks per IP within the velocity window. */
  maxClicksPerIp?: number;
  /** Salt for hashing IPs (defaults to env CLICK_IP_HASH_SALT or a constant). */
  ipHashSalt?: string;
  now?: () => Date;
  generateId?: () => string;
}

const DEFAULTS = {
  dedupWindowMs: 30_000,
  velocityWindowMs: 60_000,
  maxClicksPerUser: 10,
  maxClicksPerIp: 20,
};

export class ClickFraudService {
  private readonly dedupWindowMs: number;
  private readonly velocityWindowMs: number;
  private readonly maxClicksPerUser: number;
  private readonly maxClicksPerIp: number;
  private readonly ipHashSalt: string;
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(
    private readonly prisma: ClickFraudPrisma,
    options: ClickFraudOptions = {},
  ) {
    this.dedupWindowMs = options.dedupWindowMs ?? DEFAULTS.dedupWindowMs;
    this.velocityWindowMs = options.velocityWindowMs ?? DEFAULTS.velocityWindowMs;
    this.maxClicksPerUser = options.maxClicksPerUser ?? DEFAULTS.maxClicksPerUser;
    this.maxClicksPerIp = options.maxClicksPerIp ?? DEFAULTS.maxClicksPerIp;
    this.ipHashSalt =
      options.ipHashSalt ?? process.env['CLICK_IP_HASH_SALT'] ?? 'quantads-click-salt';
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => globalThis.crypto.randomUUID());
  }

  private hashIp(ip?: string): string | null {
    if (!ip) return null;
    return createHash('sha256').update(`${this.ipHashSalt}:${ip}`).digest('hex');
  }

  /**
   * Assess a click for fraud and record it durably. Returns the verdict; callers
   * only charge/credit when `billable` is true.
   */
  async assessAndRecord(input: ClickAssessmentInput): Promise<ClickVerdict> {
    const nowMs = this.now().getTime();
    const ipHash = this.hashIp(input.ip);

    // Look back over the widest window we care about, then bucket in-process so
    // the same query feeds both dedup and velocity checks.
    const lookbackMs = Math.max(this.dedupWindowMs, this.velocityWindowMs);
    const since = new Date(nowMs - lookbackMs);
    const recent = await this.prisma.adClickEvent.findMany({
      where: { userId: input.userId, createdAt: { gte: since } },
    });

    const recentByIp = ipHash
      ? await this.prisma.adClickEvent.findMany({
          where: { ipHash, createdAt: { gte: since } },
        })
      : [];

    let billable = true;
    let fraudFlag = false;
    let fraudReason: string | undefined;

    // DEDUP: same (userId, adId) within the dedup window.
    const dupe = recent.some(
      (e) => e.adId === input.adId && nowMs - new Date(e.createdAt).getTime() <= this.dedupWindowMs,
    );
    if (dupe) {
      billable = false;
      fraudFlag = true;
      fraudReason = 'duplicate_click';
    }

    // VELOCITY (user): too many clicks from this user in the velocity window.
    if (billable) {
      const userClicks = recent.filter(
        (e) => nowMs - new Date(e.createdAt).getTime() <= this.velocityWindowMs,
      ).length;
      if (userClicks >= this.maxClicksPerUser) {
        billable = false;
        fraudFlag = true;
        fraudReason = 'user_velocity';
      }
    }

    // VELOCITY (ip): too many clicks from this IP in the velocity window.
    if (billable && ipHash) {
      const ipClicks = recentByIp.filter(
        (e) => nowMs - new Date(e.createdAt).getTime() <= this.velocityWindowMs,
      ).length;
      if (ipClicks >= this.maxClicksPerIp) {
        billable = false;
        fraudFlag = true;
        fraudReason = 'ip_velocity';
      }
    }

    const row = await this.prisma.adClickEvent.create({
      data: {
        id: this.generateId(),
        adId: input.adId,
        campaignId: input.campaignId ?? null,
        userId: input.userId,
        ipHash,
        deviceFp: input.deviceFp ?? null,
        billable,
        fraudFlag,
        fraudReason: fraudReason ?? null,
        createdAt: this.now(),
      },
    });

    return {
      billable,
      fraudFlag,
      ...(fraudReason ? { fraudReason } : {}),
      eventId: row.id,
    };
  }
}
