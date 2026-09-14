import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { TeacherEditForm } from "./TeacherEditForm";

export default async function EditTeacherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teacherId = Number(id);

  const [teacher, teamLeaderCandidates] = await Promise.all([
    prisma.teacher.findUnique({
      where: { id: teacherId },
      include: { rates: { orderBy: { effectiveFrom: "desc" }, take: 1 } },
    }),
    prisma.teacher.findMany({
      where: { siteId: DEFAULT_SITE_ID, id: { not: teacherId } },
      orderBy: { realName: "asc" },
      select: TEACHER_SUMMARY_SELECT,
    }),
  ]);

  if (!teacher) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">강사 정보 수정 — {teacher.realName}</h1>
      <TeacherEditForm
        teacher={{
          id: teacher.id,
          realName: teacher.realName,
          nickname: teacher.nickname,
          loginId: teacher.loginId,
          nationality: teacher.nationality,
          email: teacher.email,
          approvalStatus: teacher.approvalStatus,
          currentRate: teacher.rates[0]?.ratePerUnit.toString() ?? null,
          teacherGrade: teacher.teacherGrade,
          teamLeaderId: teacher.teamLeaderId,
          sex: teacher.sex,
          age: teacher.age,
          schoolName: teacher.schoolName,
          major: teacher.major,
          address: teacher.address,
          availableHours: teacher.availableHours,
          mobilePhone: teacher.mobilePhone,
          teamsId: teacher.teamsId,
          teamsUrl: teacher.teamsUrl,
          zoomUrl: teacher.zoomUrl,
          zoomPw: teacher.zoomPw,
          tencentUrl: teacher.tencentUrl,
          experience: teacher.experience,
          selfIntroduction: teacher.selfIntroduction,
          photoUrl: teacher.photoUrl,
          voiceUrl: teacher.voiceUrl,
          videoYoutubeCode: teacher.videoYoutubeCode,
          tesol: teacher.tesol,
          priority: teacher.priority,
        }}
        teamLeaderOptions={teamLeaderCandidates.map((t) => ({ id: t.id, label: t.realName }))}
      />
    </div>
  );
}
