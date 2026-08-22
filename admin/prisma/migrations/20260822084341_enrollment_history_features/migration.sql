/*
  Warnings:

  - The `paymentStatus` column on the `enrollments` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'FAILED');

-- AlterTable
ALTER TABLE "class_sessions" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "enrollments" DROP COLUMN "paymentStatus",
ADD COLUMN     "paymentStatus" "PaymentStatus";

-- CreateTable
CREATE TABLE "monthly_evaluations" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "teacherId" INTEGER,
    "yearMonth" TEXT NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_evaluations_siteId_idx" ON "monthly_evaluations"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_evaluations_studentId_yearMonth_key" ON "monthly_evaluations"("studentId", "yearMonth");

-- AddForeignKey
ALTER TABLE "monthly_evaluations" ADD CONSTRAINT "monthly_evaluations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_evaluations" ADD CONSTRAINT "monthly_evaluations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_evaluations" ADD CONSTRAINT "monthly_evaluations_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
