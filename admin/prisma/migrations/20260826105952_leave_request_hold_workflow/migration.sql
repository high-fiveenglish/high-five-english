-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" INTEGER,
ADD COLUMN     "requestedByRole" "RoleName" NOT NULL DEFAULT 'STUDENT',
ADD COLUMN     "status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED';
