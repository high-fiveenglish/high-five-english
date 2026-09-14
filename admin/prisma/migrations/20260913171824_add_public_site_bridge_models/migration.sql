-- CreateEnum
CREATE TYPE "EnrollmentRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "enrollment_requests" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "meetingPlatform" TEXT NOT NULL,
    "teamsId" TEXT,
    "curriculumTrack" TEXT NOT NULL,
    "durationId" TEXT NOT NULL,
    "lessonFrequency" TEXT NOT NULL,
    "lessonDurationMin" INTEGER NOT NULL,
    "weeklyDays" INTEGER[],
    "preferredStartDate" TIMESTAMP(3) NOT NULL,
    "preferredStartTimeKST" TEXT NOT NULL,
    "pointsToUse" INTEGER NOT NULL DEFAULT 0,
    "status" "EnrollmentRequestStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_notices" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorAdminId" INTEGER,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consult_channels" (
    "id" TEXT NOT NULL,
    "siteId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consult_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_posts" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "studentId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enrollment_requests_siteId_idx" ON "enrollment_requests"("siteId");

-- CreateIndex
CREATE INDEX "enrollment_requests_studentId_idx" ON "enrollment_requests"("studentId");

-- CreateIndex
CREATE INDEX "home_notices_siteId_idx" ON "home_notices"("siteId");

-- CreateIndex
CREATE INDEX "consult_channels_siteId_idx" ON "consult_channels"("siteId");

-- CreateIndex
CREATE INDEX "review_posts_siteId_idx" ON "review_posts"("siteId");

-- CreateIndex
CREATE INDEX "review_posts_studentId_idx" ON "review_posts"("studentId");

-- CreateIndex
CREATE INDEX "review_posts_parentId_idx" ON "review_posts"("parentId");

-- AddForeignKey
ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_requests" ADD CONSTRAINT "enrollment_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_notices" ADD CONSTRAINT "home_notices_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consult_channels" ADD CONSTRAINT "consult_channels_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_posts" ADD CONSTRAINT "review_posts_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_posts" ADD CONSTRAINT "review_posts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "review_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_posts" ADD CONSTRAINT "review_posts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
