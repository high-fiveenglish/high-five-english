import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { formatAppDateTime } from "@/lib/appTime";
import { HoldRequestForm } from "./HoldRequestForm";

const fmtDateTime = formatAppDateTime;

export default async function NewHoldRequestPage() {
  const teacher = await requireTeacher();

  // Hold 신청이 가능한 수업만 선택지로 보여준다: 본인 담당 · 삭제되지 않음 ·
  // 예정 상태 · 아직 지나지 않음 · 이미 PENDING/APPROVED된 요청이 없음(REJECTED는 재신청 허용).
  const sessions = await prisma.classSession.findMany({
    where: {
      teacherId: teacher.id,
      deletedAt: null,
      status: "SCHEDULED",
      scheduledAt: { gt: new Date() },
      OR: [{ leaveRequest: null }, { leaveRequest: { status: "REJECTED" } }],
    },
    include: { student: true },
    orderBy: { scheduledAt: "asc" },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">New Hold Request</h1>
      <HoldRequestForm
        options={sessions.map((s) => ({
          id: s.id,
          label: `${fmtDateTime(s.scheduledAt)} · ${s.student.name} 학생`,
        }))}
      />
    </div>
  );
}
