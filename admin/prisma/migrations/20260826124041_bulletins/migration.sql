-- CreateTable
CREATE TABLE "bulletins" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorAdminId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulletins_siteId_idx" ON "bulletins"("siteId");

-- AddForeignKey
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
