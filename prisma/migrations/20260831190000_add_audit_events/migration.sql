CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "userId" TEXT,
    "actorLabel" TEXT,
    "apiKeyId" TEXT,
    "requestId" TEXT,
    "method" TEXT,
    "route" TEXT,
    "statusCode" INTEGER,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_occurredAt_id_idx" ON "AuditEvent"("occurredAt" DESC, "id" DESC);
CREATE INDEX "AuditEvent_userId_occurredAt_idx" ON "AuditEvent"("userId", "occurredAt" DESC);
CREATE INDEX "AuditEvent_category_occurredAt_idx" ON "AuditEvent"("category", "occurredAt" DESC);
CREATE INDEX "AuditEvent_action_occurredAt_idx" ON "AuditEvent"("action", "occurredAt" DESC);
CREATE INDEX "AuditEvent_outcome_occurredAt_idx" ON "AuditEvent"("outcome", "occurredAt" DESC);

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
