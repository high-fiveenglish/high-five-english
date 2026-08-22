-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "classTime" TEXT,
ADD COLUMN     "textbookName" TEXT;

-- AlterTable
ALTER TABLE "level_tests" ADD COLUMN     "ageGroup" TEXT,
ADD COLUMN     "englishLevel" TEXT,
ADD COLUMN     "interestTopic" TEXT,
ADD COLUMN     "teacherNote" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "email" TEXT,
ADD COLUMN     "kakaoId" TEXT;
