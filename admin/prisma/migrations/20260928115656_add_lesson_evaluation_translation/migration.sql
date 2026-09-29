-- AlterTable
ALTER TABLE "lesson_evaluations" ADD COLUMN     "contentTranslated" TEXT,
ADD COLUMN     "contentTranslatedLang" TEXT,
ALTER COLUMN "content" SET DATA TYPE TEXT;
