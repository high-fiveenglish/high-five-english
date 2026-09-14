import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { DeleteButton } from "../DeleteButton";
import { ImpersonateButton } from "../students/ImpersonateButton";
import { deleteEnrollment } from "./actions";
import { StatusSelect } from "./StatusSelect";
import { FILTER_TABS, buildEnrollmentWhere } from "./filters";

const PAYMENT_STATUS_LABEL: Record<string, string> = { UNPAID: "미결제", PAID: "결제완료", FAILED: "결제실패" };
const PAYMENT_STATUS_CLASS: Record<string, string> = {
  UNPAID: "bg-slate-100 text-slate-500",
  PAID: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function EnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter, q } = await searchParams;
  // 필터를 지정하지 않고 들어오면(메뉴 클릭 시 기본 진입) "진행중"을 기본으로 보여준다 —
  // 관리자가 매번 "전체"에서 다시 걸러야 했던 문제. 전체 목록은 "전체" 탭에서 명시적으로 본다.
  const effectiveFilter = filter ?? "active";
  const query = q?.trim();

  const enrollments = await prisma.enrollment.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      ...buildEnrollmentWhere(effectiveFilter),
      ...(query
        ? {
            student: {
              OR: [{ name: { contains: query, mode: "insensitive" } }, { loginId: { contains: query, mode: "insensitive" } }],
            },
          }
        : {}),
    },
    orderBy: { id: "desc" },
    include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
    take: 300,
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">수강내역관리</h1>
        <Link
          href="/enrollments/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 수강신청 등록
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {FILTER_TABS.map((tab) => {
          const active = effectiveFilter === tab.key;
          const params = new URLSearchParams();
          if (tab.key !== "active") params.set("filter", tab.key);
          if (query) params.set("q", query);
          const qs = params.toString();
          const href = qs ? `/enrollments?${qs}` : "/enrollments";
          return (
            <Link
              key={tab.key}
              href={href}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <form className="mb-4 flex gap-2" method="get">
        {effectiveFilter !== "active" && <input type="hidden" name="filter" value={effectiveFilter} />}
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="학생 이름 또는 아이디로 검색"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          검색
        </button>
        {query && (
          <Link
            href={effectiveFilter === "active" ? "/enrollments" : `/enrollments?filter=${effectiveFilter}`}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:underline"
          >
            초기화
          </Link>
        )}
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">학생</th>
              <th className="px-4 py-3" />
              <th className="px-4 py-3">강사</th>
              <th className="px-4 py-3">패키지</th>
              <th className="px-4 py-3">방식</th>
              <th className="px-4 py-3">요일</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3">총 회차</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">결제</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{e.student.name}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ImpersonateButton studentId={e.studentId} studentName={e.student.name} />
                </td>
                <td className="px-4 py-3 text-slate-600">{e.teacher?.realName ?? "미배정"}</td>
                <td className="px-4 py-3 text-slate-600">{e.packageMonths}개월</td>
                <td className="px-4 py-3 text-slate-600">{e.classMethod}</td>
                <td className="px-4 py-3 text-slate-600">{e.scheduleDays}</td>
                <td className="px-4 py-3 text-slate-500">
                  {fmtDate(e.startDate)} ~ {fmtDate(e.endDate)}
                </td>
                <td className="px-4 py-3 text-slate-600">{e.totalSessions}회</td>
                <td className="px-4 py-3">
                  <StatusSelect id={e.id} status={e.status} />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      PAYMENT_STATUS_CLASS[e.paymentStatus ?? "UNPAID"]
                    }`}
                  >
                    {PAYMENT_STATUS_LABEL[e.paymentStatus ?? "UNPAID"]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* 실제로 수업이 진행 중인(진행중=ACTIVE) 수강 건에서만 수업관리로
                        들어갈 수 있다 — 접수/종료/이탈 등은 아직 진행할 실제 수업이
                        없거나 더 이상 없으므로 여기서 굳이 노출하지 않는다. */}
                    {e.status === "ACTIVE" && (
                      <Link
                        href={`/students/${e.studentId}/sessions`}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        수업관리
                      </Link>
                    )}
                    <Link
                      href={`/enrollments/${e.id}/edit`}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      수정
                    </Link>
                    <DeleteButton action={deleteEnrollment.bind(null, e.id)} />
                  </div>
                </td>
              </tr>
            ))}
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                  해당하는 수강내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
