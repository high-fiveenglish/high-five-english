import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteLevelTest } from "./actions";
import { ProgressSelect } from "./ProgressSelect";
import { TeacherAssignSelect } from "./TeacherAssignSelect";

export default async function LevelTestsPage() {
  const [levelTests, teachers] = await Promise.all([
    prisma.levelTest.findMany({
      where: { siteId: DEFAULT_SITE_ID },
      orderBy: { id: "desc" },
      include: { student: true, teacher: true },
    }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" } }),
  ]);

  const teacherOptions = teachers.map((t) => ({ id: t.id, label: t.realName }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">레벨테스트 신청/진행 관리</h1>
        <Link
          href="/level-tests/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 레벨테스트 신청 등록
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">구분</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">연락처</th>
              <th className="px-4 py-3">방식</th>
              <th className="px-4 py-3">신청일</th>
              <th className="px-4 py-3">일정</th>
              <th className="px-4 py-3">담당 강사</th>
              <th className="px-4 py-3">진행 상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {levelTests.map((lt) => {
              const isLead = !lt.studentId;
              const name = lt.student?.name ?? lt.leadStudentEnglishName ?? "-";
              const method = lt.classMethod ?? lt.leadMeetingPlatform ?? "-";
              const schedule = lt.scheduledTestDate
                ? lt.scheduledTestDate.toISOString().slice(0, 16).replace("T", " ")
                : lt.leadPreferredTimeUTC
                  ? `${lt.leadPreferredTimeUTC.toISOString().slice(0, 16).replace("T", " ")} (희망)`
                  : "-";
              return (
                <tr key={lt.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        isLead ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {isLead ? "리드" : "정식"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{name}</td>
                  <td className="px-4 py-3 text-slate-600">{lt.leadContactPhone ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{method}</td>
                  <td className="px-4 py-3 text-slate-500">{lt.appliedAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-3 text-slate-500">{schedule}</td>
                  <td className="px-4 py-3">
                    <TeacherAssignSelect id={lt.id} teacherId={lt.teacherId} teachers={teacherOptions} />
                  </td>
                  <td className="px-4 py-3">
                    <ProgressSelect id={lt.id} progressStatus={lt.progressStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DeleteButton action={deleteLevelTest.bind(null, lt.id)} />
                  </td>
                </tr>
              );
            })}
            {levelTests.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  등록된 레벨테스트 신청이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
