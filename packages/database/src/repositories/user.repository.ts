import { Prisma, User } from '@prisma/client';
import { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository';

/**
 * The single source of truth for what "public user" means. `UserPublic` below
 * is `Pick`ed off this object, so a column is public only if it is listed here.
 *
 * Deliberately absent: `passwordHash`, every `twoFactor*` field except the
 * `twoFactorEnabled` flag, `lastLoginIp`, `failedLoginAttempts`,
 * `lockoutUntil`, and `ghostMode`.
 */
export const userPublicSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  bannerUrl: true,
  phoneNumber: true,
  role: true,
  status: true,
  emailVerified: true,
  phoneVerified: true,
  twoFactorEnabled: true,
  bio: true,
  website: true,
  location: true,
  dateOfBirth: true,
  lastLoginAt: true,
  loginCount: true,
  preferences: true,
  metadata: true,
  // Public-facing gamification stats.
  xpPoints: true,
  level: true,
  // Public verified-badge flag (QuantSync verified space — migration 0024).
  isVerified: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

/**
 * Public user shape — derived from `userPublicSelect` rather than restated.
 *
 * This used to be `Omit<User, …6 sensitive fields>`, which meant every column
 * added to `User` became part of the public shape unless someone remembered to
 * extend the exclusion list. That default is backwards for a type whose whole
 * job is to keep secrets out, and it broke the moment the 2FA columns landed:
 * `Omit` claimed `twoFactorPendingSecret` while `userPublicSelect` never
 * fetched it, so the type and the query disagreed.
 *
 * `Pick` off the select makes the select the single source of truth. A new
 * column is now private by default and must be listed above to become public,
 * and the two can no longer drift.
 *
 * Still excluded, and deliberately: `passwordHash`, `twoFactorSecret`,
 * `twoFactorPendingSecret`, `twoFactorLastUsedStep` (leaking the last accepted
 * TOTP step narrows a replay window), `twoFactorConfirmedAt`, `lastLoginIp`,
 * `failedLoginAttempts`, `lockoutUntil`, and the `ghostMode` privacy setting.
 */
export type UserPublic = Pick<User, keyof typeof userPublicSelect>;

export class UserRepository extends BaseRepository {
  /**
   * Find user by ID - returns public fields only.
   * Use findByIdWithPassword for auth flows.
   */
  async findById(id: string): Promise<UserPublic | null> {
    return this.prisma.user.findUnique({ where: { id }, select: userPublicSelect });
  }

  /**
   * Find user by ID with all fields including sensitive data.
   * Only use for authentication/authorization flows.
   */
  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { phoneNumber: phone } });
  }

  async findMany(options: PaginationOptions = {}): Promise<PaginatedResult<UserPublic>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        select: userPublicSelect,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async softDelete(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DEACTIVATED' },
    });
  }

  async updateLastLogin(id: string, ip: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        loginCount: { increment: 1 },
        failedLoginAttempts: 0,
      },
    });
  }

  async incrementFailedAttempts(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
    });
  }
}
