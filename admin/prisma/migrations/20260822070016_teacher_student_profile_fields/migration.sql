-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ResidenceRegion" AS ENUM ('KOREA', 'CHINA', 'VIETNAM', 'JAPAN', 'AUSTRALIA', 'USA_OTHER');

-- CreateEnum
CREATE TYPE "TeacherGrade" AS ENUM ('SENIOR', 'GENERAL');

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "englishName" TEXT,
ADD COLUMN     "etcNote" TEXT,
ADD COLUMN     "landlinePhone" TEXT,
ADD COLUMN     "mobilePhone" TEXT,
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "parentContact" TEXT,
ADD COLUMN     "parentName" TEXT,
ADD COLUMN     "preferredClassMethod" TEXT,
ADD COLUMN     "referrerId" TEXT,
ADD COLUMN     "region" "ResidenceRegion",
ADD COLUMN     "sex" "Sex",
ADD COLUMN     "smsOptIn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "teamsId" TEXT;

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "age" INTEGER,
ADD COLUMN     "availableHours" INTEGER[],
ADD COLUMN     "availableTimeText" TEXT,
ADD COLUMN     "experience" TEXT,
ADD COLUMN     "major" TEXT,
ADD COLUMN     "mobilePhone" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "schoolName" TEXT,
ADD COLUMN     "selfIntroduction" TEXT,
ADD COLUMN     "sex" "Sex",
ADD COLUMN     "teacherGrade" "TeacherGrade" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "teamsId" TEXT,
ADD COLUMN     "tencentUrl" TEXT,
ADD COLUMN     "tesol" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "videoYoutubeCode" TEXT,
ADD COLUMN     "voiceUrl" TEXT,
ADD COLUMN     "zoomPw" TEXT,
ADD COLUMN     "zoomUrl" TEXT;
