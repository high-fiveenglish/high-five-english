import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { DeleteButton } from "../DeleteButton";
import { deleteLevelTest } from "./actions";
import { ProgressSelect } from "./ProgressSelect";
import { TeacherAssignSelect } from "./TeacherAssignSelect";
import { formatAppDateTime } from "@/lib/appTime";

export default async function LevelTestsPage() {
  const [levelTests, teachers] = await Promise.all([
    prisma.levelTest.findMany({
      where: { siteId: DEFAULT_SITE_ID },
      orderBy: { id: "desc" },
      include: { student: true, teacher: true },
    }),
    // 신규 배정 시 선택 가능한 강사는 ACTIVE만 노출한다 — 이미 배정된 레벨테스트가
    // INACTIVE/SUSPENDED 강사를 가리키는 경우는 아래에서 행 단위로 별도 처리한다.
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID, accountStatus: "ACTIVE" }, orderBy: { realName: "asc" } }),
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
                ? formatAppDateTime(lt.scheduledTestDate)
                : lt.leadPreferredTimeUTC
                  ? `${formatAppDateTime(lt.leadPreferredTimeUTC)} (희망)`
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
                    <TeacherAssignSelect
                      id={lt.id}
                      teacherId={lt.teacherId}
                      teachers={
                        // 현재 배정된 강사가 이미 비활성 상태라면, 선택 목록에서 사라져 값이
                        // 깨져 보이지 않도록 그 강사만 예외적으로 옵션에 추가한다(재선택 가능
                        // 여부와 무관하게 "지금 배정된 사람이 누구인지"는 항상 보여야 한다).
                        lt.teacher && lt.teacher.accountStatus !== "ACTIVE"
                          ? [...teacherOptions, { id: lt.teacher.id, label: `${lt.teacher.realName} (비활성)` }]
                          : teacherOptions
                      }
                    />
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
