import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { StudentEditForm } from "./StudentEditForm";
import { ConsultationNotes } from "./ConsultationNotes";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const studentId = Number(id);

  const [student, notes, agents] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId } }),
    prisma.consultationNote.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agent.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { name: "asc" } }),
  ]);

  if (!student) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">학생 정보 수정 — {student.name}</h1>
      <StudentEditForm
        student={{
          id: student.id,
          name: student.name,
          loginId: student.loginId,
          agentId: student.agentId,
          grade: student.grade,
          status: student.status,
          points: student.points,
          discountRate: student.discountRate.toString(),
          englishName: student.englishName,
          sex: student.sex,
          birthDate: student.birthDate ? student.birthDate.toISOString().slice(0, 10) : null,
          occupation: student.occupation,
          region: student.region,
          address: student.address,
          mobilePhone: student.mobilePhone,
          etcNote: student.etcNote,
          preferredClassMethod: student.preferredClassMethod,
          teamsId: student.teamsId,
          kakaoId: student.kakaoId,
          wechatId: student.wechatId,
          consultRoute: student.consultRoute,
          referrerId: student.referrerId,
        }}
        agents={agents.map((a) => ({ id: a.id, name: a.name }))}
      />
      <ConsultationNotes
        studentId={student.id}
        notes={notes.map((n) => ({ id: n.id, content: n.content, createdAt: fmtDateTime(n.createdAt) }))}
      />
    </div>
  );
}
