-- CreateTable
CREATE TABLE "instructors" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "flag" TEXT NOT NULL,
    "gradient" TEXT NOT NULL,
    "photoUrl" TEXT,
    "audioSrc" TEXT,
    "defaultMeetingPlatform" TEXT,
    "bio" TEXT NOT NULL,
    "career" TEXT[],
    "availableDays" INTEGER[],
    "availableHours" TEXT NOT NULL,
    "classFeatures" TEXT[],
    "specialties" TEXT[],
    "levels" TEXT[],
    "teachingStyle" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_durations" (
    "id" SERIAL NOT NULL,
    "siteId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "hasBadge" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pricing_durations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rows" (
    "id" SERIAL NOT NULL,
    "durationId" INTEGER NOT NULL,
    "frequencyId" TEXT NOT NULL,
    "price25KRW" INTEGER,
    "price25CNY" INTEGER,
    "price25VND" INTEGER,
    "price50KRW" INTEGER,
    "price50CNY" INTEGER,
    "price50VND" INTEGER,

    CONSTRAINT "pricing_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instructors_slug_key" ON "instructors"("slug");

-- CreateIndex
CREATE INDEX "instructors_siteId_idx" ON "instructors"("siteId");

-- CreateIndex
CREATE INDEX "pricing_durations_siteId_idx" ON "pricing_durations"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_durations_siteId_code_key" ON "pricing_durations"("siteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rows_durationId_frequencyId_key" ON "pricing_rows"("durationId", "frequencyId");

-- AddForeignKey
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_durations" ADD CONSTRAINT "pricing_durations_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rows" ADD CONSTRAINT "pricing_rows_durationId_fkey" FOREIGN KEY ("durationId") REFERENCES "pricing_durations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
