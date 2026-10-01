Loaded Prisma config from prisma.config.ts.

-- CreateTable
CREATE TABLE "audio_recordings" (
    "id" SERIAL NOT NULL,
    "classSessionId" INTEGER NOT NULL,
    "driveFileId" TEXT,
    "fileName" TEXT NOT NULL,
    "duration" INTEGER,
    "provider" TEXT,
    "providerTranscriptId" TEXT,
    "transcript" TEXT,
    "teacherSpeakingSeconds" INTEGER,
    "studentSpeakingSeconds" INTEGER,
    "teacherTalkPercentage" INTEGER,
    "studentTalkPercentage" INTEGER,
    "aiDraft" TEXT,
    "teacherQcDraft" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'UPLOADED',
    "errorMessage" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyzedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audio_recordings_classSessionId_key" ON "audio_recordings"("classSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "audio_recordings_providerTranscriptId_key" ON "audio_recordings"("providerTranscriptId");

-- AddForeignKey
ALTER TABLE "audio_recordings" ADD CONSTRAINT "audio_recordings_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

