-- Additive migration: regular-session cascade postponement, student leave quota, teacher paid leave, supplement tracking.
-- Every new column is nullable or has a default; no existing row is rewritten. Safe to apply before the new code ships.
-- CreateEnum
CREATE TYPE "TeacherEmploymentType" AS ENUM ('REGULAR', 'NON_REGULAR');

-- CreateEnum
CREATE TYPE "RescheduleSource" AS ENUM ('STUDENT_POSTPONEMENT', 'ADMIN_POSTPONEMENT', 'TEACHER_HOLD', 'ACADEMY_CLOSURE', 'PAID_LEAVE', 'OTHER_UNPAID_LEAVE');

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "employmentType" "TeacherEmploymentType" NOT NULL DEFAULT 'NON_REGULAR';

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "leaveQuotaAdjustment" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "relatedSessionId" INTEGER;

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "executedById" INTEGER,
ADD COLUMN     "executedByRole" "RoleName",
ADD COLUMN     "finalSource" "RescheduleSource",
ADD COLUMN     "paidLeaveId" INTEGER,
ADD COLUMN     "previousEndDate" TIMESTAMP(3),
ADD COLUMN     "quotaImpact" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "replacementSessionId" INTEGER,
ADD COLUMN     "source" "RescheduleSource",
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededByClosureId" INTEGER;

-- CreateTable
CREATE TABLE "teacher_paid_leaves" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "leaveDate" DATE NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" INTEGER,
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "postApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_paid_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_paid_leaves_siteId_idx" ON "teacher_paid_leaves"("siteId");

-- CreateIndex
CREATE INDEX "teacher_paid_leaves_leaveDate_idx" ON "teacher_paid_leaves"("leaveDate");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_paid_leaves_teacherId_leaveDate_key" ON "teacher_paid_leaves"("teacherId", "leaveDate");

-- CreateIndex
CREATE INDEX "class_sessions_relatedSessionId_idx" ON "class_sessions"("relatedSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_replacementSessionId_key" ON "leave_requests"("replacementSessionId");

-- CreateIndex
CREATE INDEX "leave_requests_enrollmentId_idx" ON "leave_requests"("enrollmentId");

-- CreateIndex
CREATE INDEX "leave_requests_supersededByClosureId_idx" ON "leave_requests"("supersededByClosureId");

-- CreateIndex
CREATE INDEX "leave_requests_paidLeaveId_idx" ON "leave_requests"("paidLeaveId");

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_relatedSessionId_fkey" FOREIGN KEY ("relatedSessionId") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_supersededByClosureId_fkey" FOREIGN KEY ("supersededByClosureId") REFERENCES "academy_closures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_replacementSessionId_fkey" FOREIGN KEY ("replacementSessionId") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_paidLeaveId_fkey" FOREIGN KEY ("paidLeaveId") REFERENCES "teacher_paid_leaves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_paid_leaves" ADD CONSTRAINT "teacher_paid_leaves_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_paid_leaves" ADD CONSTRAINT "teacher_paid_leaves_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A leave request counts at most once against the student's quota.
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_quotaImpact_check" CHECK ("quotaImpact" IN (0, 1));
