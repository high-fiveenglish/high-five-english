-- CreateEnum
CREATE TYPE "SessionGenerationMode" AS ENUM ('PILOT', 'FULL');

-- CreateEnum
CREATE TYPE "SessionGenerationStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "SessionGenerationItemOutcome" AS ENUM ('GENERATED', 'CONFLICT', 'INACTIVE_TEACHER', 'TIME_UNVERIFIED', 'ALREADY_GENERATED', 'EXISTING_SESSIONS', 'EXCLUDED', 'STALE', 'ERROR');

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "generationBatchId" TEXT,
ADD COLUMN     "generationKey" TEXT;

-- CreateTable
CREATE TABLE "session_generation_batches" (
    "id" TEXT NOT NULL,
    "mode" "SessionGenerationMode" NOT NULL,
    "status" "SessionGenerationStatus" NOT NULL DEFAULT 'RUNNING',
    "activeLock" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "asOfKstDate" TEXT NOT NULL,
    "plannerVersion" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "expectedSessions" INTEGER NOT NULL,
    "requestedEnrollmentIds" INTEGER[],
    "plannedEnrollments" INTEGER NOT NULL DEFAULT 0,
    "plannedSessions" INTEGER NOT NULL DEFAULT 0,
    "createdSessions" INTEGER NOT NULL DEFAULT 0,
    "skippedPast" INTEGER NOT NULL DEFAULT 0,
    "skippedStartedToday" INTEGER NOT NULL DEFAULT 0,
    "skippedExisting" INTEGER NOT NULL DEFAULT 0,
    "skippedClosure" INTEGER NOT NULL DEFAULT 0,
    "withheldByConflict" INTEGER NOT NULL DEFAULT 0,
    "conflictEnrollments" INTEGER NOT NULL DEFAULT 0,
    "inactiveTeacherEnrollments" INTEGER NOT NULL DEFAULT 0,
    "timeUnverifiedEnrollments" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "populationSummary" JSONB,
    "actorLabel" TEXT NOT NULL,
    "actorAdminId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "session_generation_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_generation_batch_items" (
    "id" SERIAL NOT NULL,
    "batchId" TEXT NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "outcome" "SessionGenerationItemOutcome" NOT NULL,
    "reasons" TEXT[],
    "plannedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_generation_batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_generation_batches_activeLock_key" ON "session_generation_batches"("activeLock");

-- CreateIndex
CREATE INDEX "session_generation_batches_startedAt_idx" ON "session_generation_batches"("startedAt");

-- CreateIndex
CREATE INDEX "session_generation_batch_items_enrollmentId_idx" ON "session_generation_batch_items"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "session_generation_batch_items_batchId_enrollmentId_key" ON "session_generation_batch_items"("batchId", "enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_generationKey_key" ON "class_sessions"("generationKey");

-- CreateIndex
CREATE INDEX "class_sessions_generationBatchId_idx" ON "class_sessions"("generationBatchId");

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_generationBatchId_fkey" FOREIGN KEY ("generationBatchId") REFERENCES "session_generation_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_generation_batch_items" ADD CONSTRAINT "session_generation_batch_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "session_generation_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

