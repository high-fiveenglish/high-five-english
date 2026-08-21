-- DropForeignKey
ALTER TABLE "level_tests" DROP CONSTRAINT "level_tests_studentId_fkey";

-- AlterTable
ALTER TABLE "level_tests" ADD COLUMN     "leadContactName" TEXT,
ADD COLUMN     "leadContactPhone" TEXT,
ADD COLUMN     "leadLessonDurationMin" INTEGER,
ADD COLUMN     "leadLessonFrequency" TEXT,
ADD COLUMN     "leadMeetingPlatform" TEXT,
ADD COLUMN     "leadPreferredTimeUTC" TIMESTAMP(3),
ADD COLUMN     "leadPreferredTimeZone" TEXT,
ADD COLUMN     "leadReferredTeacherName" TEXT,
ADD COLUMN     "leadStudentAge" INTEGER,
ADD COLUMN     "leadStudentEnglishName" TEXT,
ALTER COLUMN "studentId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "level_tests" ADD CONSTRAINT "level_tests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
