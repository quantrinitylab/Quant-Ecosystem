-- QuantMail productivity features: server-side filters/rules, vacation
-- auto-responder, reusable templates, and signatures. All additive and
-- quantmail-owned; each table is per-user and cascade-deleted with the owner.

-- CreateTable: mail_filters
CREATE TABLE "mail_filters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "matchAll" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_filters_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mail_filters_userId_idx" ON "mail_filters"("userId");

-- CreateTable: vacation_responders
CREATE TABLE "vacation_responders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "onlyContacts" BOOLEAN NOT NULL DEFAULT false,
    "intervalDays" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacation_responders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vacation_responders_userId_key" ON "vacation_responders"("userId");

-- CreateTable: vacation_autoreply_logs
CREATE TABLE "vacation_autoreply_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "repliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacation_autoreply_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vacation_autoreply_logs_userId_idx" ON "vacation_autoreply_logs"("userId");
CREATE UNIQUE INDEX "vacation_autoreply_logs_userId_toAddress_key" ON "vacation_autoreply_logs"("userId", "toAddress");

-- CreateTable: email_templates
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "shortcut" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_templates_userId_idx" ON "email_templates"("userId");
CREATE UNIQUE INDEX "email_templates_userId_name_key" ON "email_templates"("userId", "name");

-- CreateTable: email_signatures
CREATE TABLE "email_signatures" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_signatures_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_signatures_userId_idx" ON "email_signatures"("userId");

-- AddForeignKeys
ALTER TABLE "mail_filters" ADD CONSTRAINT "mail_filters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vacation_responders" ADD CONSTRAINT "vacation_responders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vacation_autoreply_logs" ADD CONSTRAINT "vacation_autoreply_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_signatures" ADD CONSTRAINT "email_signatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
