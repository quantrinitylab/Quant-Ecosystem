-- CreateTable: QuantMax squads (persistent groups for party games / group rooms).
CREATE TABLE "squads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "squads_pkey" PRIMARY KEY ("id")
);

-- CreateTable: squad membership (OWNER/ADMIN/MEMBER; leftAt marks departure).
CREATE TABLE "squad_members" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "squad_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "squads_ownerId_idx" ON "squads"("ownerId");
CREATE UNIQUE INDEX "squad_members_squadId_userId_key" ON "squad_members"("squadId", "userId");
CREATE INDEX "squad_members_squadId_idx" ON "squad_members"("squadId");
