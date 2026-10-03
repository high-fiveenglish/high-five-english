-- AlterTable
ALTER TABLE "audio_recordings" ADD COLUMN     "confirmedTeacherSpeaker" TEXT,
ADD COLUMN     "speakerConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "speakerConfirmedByTeacherId" INTEGER,
ADD COLUMN     "speakerMappingStatus" TEXT,
ADD COLUMN     "transcriptUtterances" JSONB;
