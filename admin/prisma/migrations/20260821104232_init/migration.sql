-- CreateEnum
CREATE TYPE "StudentGrade" AS ENUM ('ADMIN', 'AGENT', 'BRANCH', 'GENERAL');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'HOLDING');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('APPLIED', 'PAID', 'ACTIVE', 'HOLDING', 'COMPLETED', 'RENEWED', 'LOST');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'MAKEUP_NEEDED');

-- CreateTable
CREATE TABLE "sites" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "name" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "grade" "StudentGrade" NOT NULL DEFAULT 'GENERAL',
    "points" INTEGER NOT NULL DEFAULT 0,
    "discountRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_notes" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "adminId" INTEGER,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultation_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "realName" TEXT NOT NULL,
    "nickname" TEXT,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nationality" TEXT,
    "timezoneOffset" INTEGER,
    "teamLeaderId" INTEGER,
    "email" TEXT,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_rates" (
    "id" SERIAL NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "ratePerUnit" DECIMAL(10,2) NOT NULL,
    "unitMinutes" INTEGER NOT NULL DEFAULT 25,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "studentId" INTEGER NOT NULL,
    "teacherId" INTEGER,
    "packageMonths" INTEGER NOT NULL,
    "classMethod" TEXT NOT NULL,
    "scheduleDays" TEXT NOT NULL,
    "classDurationMin" INTEGER NOT NULL DEFAULT 25,
    "totalSessions" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'APPLIED',
    "paymentStatus" TEXT,
    "orderNo" TEXT,
    "classType" TEXT NOT NULL DEFAULT '1:1',
    "textbookId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "teacherId" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 25,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attendance" TEXT,
    "progressNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_tests" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "studentId" INTEGER NOT NULL,
    "teacherId" INTEGER,
    "subject" TEXT,
    "classMethod" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledTestDate" TIMESTAMP(3),
    "scheduledClassDatetime" TIMESTAMP(3),
    "evaluationStatus" TEXT,
    "progressStatus" TEXT,
    "consultationStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "level_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sites_code_key" ON "sites"("code");

-- CreateIndex
CREATE UNIQUE INDEX "agents_code_key" ON "agents"("code");

-- CreateIndex
CREATE INDEX "agents_siteId_idx" ON "agents"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "students_loginId_key" ON "students"("loginId");

-- CreateIndex
CREATE INDEX "students_siteId_idx" ON "students"("siteId");

-- CreateIndex
CREATE INDEX "students_agentId_idx" ON "students"("agentId");

-- CreateIndex
CREATE INDEX "consultation_notes_studentId_idx" ON "consultation_notes"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_loginId_key" ON "teachers"("loginId");

-- CreateIndex
CREATE INDEX "teachers_siteId_idx" ON "teachers"("siteId");

-- CreateIndex
CREATE INDEX "teacher_rates_teacherId_idx" ON "teacher_rates"("teacherId");

-- CreateIndex
CREATE INDEX "enrollments_siteId_idx" ON "enrollments"("siteId");

-- CreateIndex
CREATE INDEX "enrollments_studentId_idx" ON "enrollments"("studentId");

-- CreateIndex
CREATE INDEX "enrollments_teacherId_idx" ON "enrollments"("teacherId");

-- CreateIndex
CREATE INDEX "class_sessions_siteId_idx" ON "class_sessions"("siteId");

-- CreateIndex
CREATE INDEX "class_sessions_scheduledAt_idx" ON "class_sessions"("scheduledAt");

-- CreateIndex
CREATE INDEX "class_sessions_teacherId_idx" ON "class_sessions"("teacherId");

-- CreateIndex
CREATE INDEX "class_sessions_studentId_idx" ON "class_sessions"("studentId");

-- CreateIndex
CREATE INDEX "level_tests_siteId_idx" ON "level_tests"("siteId");

-- CreateIndex
CREATE INDEX "level_tests_studentId_idx" ON "level_tests"("studentId");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_notes" ADD CONSTRAINT "consultation_notes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_teamLeaderId_fkey" FOREIGN KEY ("teamLeaderId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_rates" ADD CONSTRAINT "teacher_rates_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_tests" ADD CONSTRAINT "level_tests_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_tests" ADD CONSTRAINT "level_tests_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_tests" ADD CONSTRAINT "level_tests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "level_tests" ADD CONSTRAINT "level_tests_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
