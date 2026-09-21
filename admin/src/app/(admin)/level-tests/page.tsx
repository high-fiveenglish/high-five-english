import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { DeleteButton } from "../DeleteButton";
import { ImpersonateButton } from "../students/ImpersonateButton";
import { deleteLevelTest } from "./actions";
import { SUBJECT_OPTIONS } from "@/lib/levelTestOptions";
import { formatAppDate, formatAppDateTime } from "@/lib/appTime";
import { requireBackofficeActor } from "@/lib/backofficeAuth";

const SUBJECT_LABEL: Record<string, string> = Object.fromEntries(SUBJECT_OPTIONS.map((o) => [o.value, o.label]));

// 진행상태는 더 이상 목록에서 직접 고르는 값이 아니다 — 담당강사·수업일자와 마찬가지로
// "수정" 화면에서 확정/처리한 결과만 여기서는 배지로 보여준다.
const PROGRESS_BADGE_STYLE: Record<string, string> = {
  접수: "bg-slate-100 text-slate-600",
  수업확정: "bg-blue-100 text-blue-700",
  수업완료: "bg-emerald-100 text-emerald-700",
  결석: "bg-red-100 text-red-700",
  취소: "bg-slate-200 text-slate-500",
};

const PROGRESS_ORDER = ["접수", "수업확정", "수업완료", "결석", "취소"] as const;

export default async function LevelTestsPage() {
  const actor = await requireBackofficeActor();
  const scopeAgentId = actor.role === "AGENT" ? actor.agentId : undefined;
  const [levelTests, progressGroups] = await Promise.all([
    prisma.levelTest.findMany({
      where: { siteId: DEFAULT_SITE_ID, ...(scopeAgentId ? { agentId: scopeAgentId } : {}) },
      orderBy: { id: "desc" },
      include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
    }),
    prisma.levelTest.groupBy({
      by: ["progressStatus"],
      where: { siteId: DEFAULT_SITE_ID, ...(scopeAgentId ? { agentId: scopeAgentId } : {}) },
      _count: true,
    }),
  ]);
  const countByStatus = new Map(progressGroups.map((g) => [g.progressStatus ?? "접수", g._count]));
  const total = levelTests.length;

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

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <span className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white">전체 ({total.toLocaleString()})</span>
        {PROGRESS_ORDER.map((status) => (
          <span
            key={status}
            className={`rounded-lg px-3 py-1.5 font-medium ${PROGRESS_BADGE_STYLE[status]}`}
          >
            {status} ({(countByStatus.get(status) ?? 0).toLocaleString()})
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1300px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">No.</th>
              <th className="px-4 py-3">구분</th>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">아이디</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3">연락처</th>
              <th className="px-4 py-3">과목</th>
              <th className="px-4 py-3">방식</th>
              <th className="px-4 py-3">신청일자</th>
              <th className="px-4 py-3">테스트예정일</th>
              <th className="px-4 py-3">수업일자</th>
              <th className="px-4 py-3">담당 강사</th>
              <th className="px-4 py-3">진행상태</th>
              <th className="px-4 py-3">레벨테스트결과</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {levelTests.map((lt, i) => {
              const isLead = !lt.studentId;
              const name = lt.student?.name ?? lt.leadStudentEnglishName ?? lt.leadContactName ?? "-";
              const method = lt.classMethod ?? lt.leadMeetingPlatform ?? "-";
              const testDate = lt.scheduledTestDate
                ? formatAppDateTime(lt.scheduledTestDate)
                : lt.leadPreferredTimeUTC
                  ? `${formatAppDateTime(lt.leadPreferredTimeUTC)} (희망)`
                  : "-";
              const classDate = lt.scheduledClassDatetime ? formatAppDateTime(lt.scheduledClassDatetime) : "-";
              return (
                <tr key={lt.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 text-slate-500">{total - i}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        isLead ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {isLead ? "리드" : "정식"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link href={`/level-tests/${lt.id}`} className="hover:underline">
                      {name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{lt.student?.loginId ?? "-"}</td>
                  <td className="px-4 py-3">
                    {lt.studentId && <ImpersonateButton studentId={lt.studentId} studentName={name} />}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lt.student?.mobilePhone ?? lt.leadContactPhone ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{SUBJECT_LABEL[lt.subject ?? ""] ?? lt.subject ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{method}</td>
                  <td className="px-4 py-3 text-slate-500">{formatAppDate(lt.appliedAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{testDate}</td>
                  <td className="px-4 py-3 text-slate-500">{classDate}</td>
                  {/* 담당 강사 배정·"찾아보기"는 이제 "수정" 상세 화면에서만 한다 — 여기는
                      그 결과(확정된 강사 이름)만 보여준다. */}
                  <td className="px-4 py-3 text-slate-600">{lt.teacher?.realName ?? "미배정"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        PROGRESS_BADGE_STYLE[lt.progressStatus ?? "접수"] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {lt.progressStatus ?? "접수"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {lt.resultContent ? (
                        <Link
                          href={`/level-tests/${lt.id}/result`}
                          className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700 hover:underline"
                        >
                          확인
                        </Link>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-400">
                          미작성
                        </span>
                      )}
                      <Link
                        href={`/level-tests/${lt.id}#result`}
                        className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        수정
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        href={`/level-tests/${lt.id}`}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        수정
                      </Link>
                      <DeleteButton action={deleteLevelTest.bind(null, lt.id)} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {levelTests.length === 0 && (
              <tr>
                <td colSpan={15} className="px-4 py-10 text-center text-slate-400">
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
