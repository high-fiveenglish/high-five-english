-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "academyClosureId" INTEGER;

-- CreateTable
CREATE TABLE "academy_closures" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academy_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academy_closures_siteId_idx" ON "academy_closures"("siteId");

-- CreateIndex
CREATE INDEX "leave_requests_academyClosureId_idx" ON "leave_requests"("academyClosureId");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_academyClosureId_fkey" FOREIGN KEY ("academyClosureId") REFERENCES "academy_closures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academy_closures" ADD CONSTRAINT "academy_closures_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
