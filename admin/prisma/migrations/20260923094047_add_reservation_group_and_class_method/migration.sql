-- DropIndex
DROP INDEX "slot_reservations_convertedEnrollmentId_key";

-- AlterTable
ALTER TABLE "slot_reservations" ADD COLUMN     "classMethod" TEXT,
ADD COLUMN     "groupId" TEXT;

-- CreateIndex
CREATE INDEX "slot_reservations_groupId_idx" ON "slot_reservations"("groupId");

