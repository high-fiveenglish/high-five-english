import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { revertLeaveRequest, approveLeaveRequest, rejectLeaveRequest, revertAcademyClosure } from "./actions";
import { RevertButton } from "./RevertButton";
import { CreateLeaveForm } from "./CreateLeaveForm";
import { ApproveRejectButtons } from "./ApproveRejectButtons";
import { AcademyClosureCalendar } from "./AcademyClosureCalendar";
import { AcademyClosureRevertButton } from "./AcademyClosureRevertButton";
import { formatAppDate, formatAppDateTime } from "@/lib/appTime";
import type { Prisma } from "@/generated/prisma/client";

const fmtDateTime = formatAppDateTime;

const REQUEST_TYPE_LABEL: Record<string, string> = {
  STUDENT: "학생",
  ADMIN: "관리자",
  MANAGER: "매니저",
  TEACHER: "강사",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기중",
  APPROVED: "승인됨",
  REJECTED: "거부됨",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-slate-200 text-slate-500",
};

type TabKey = "student" | "admin" | "academy";

const TABS: { key: TabKey; label: string }[] = [
  { key: "student", label: "학생휴강 내역" },
  { key: "admin", label: "관리자휴강내역" },
  { key: "academy", label: "전체수업휴강 관리(어학원 휴강)" },
];

export default async function LeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { tab: tabParam, q } = await searchParams;
  const tab: TabKey = tabParam === "admin" || tabParam === "academy" ? tabParam : "student";
  const query = q?.trim();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">휴강 관리</h1>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "student" ? "/leave-requests" : `/leave-requests?tab=${t.key}`}
            className={`rounded-lg px-3 py-1.5 font-medium ${
              tab === t.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab !== "academy" && (
        <form className="mb-4 flex gap-2" method="get">
          <input type="hidden" name="tab" value={tab} />
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
              href={tab === "student" ? "/leave-requests" : `/leave-requests?tab=${tab}`}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:underline"
            >
              초기화
            </Link>
          )}
        </form>
      )}

      {tab === "student" && <StudentLeaveTab query={query} />}
      {tab === "admin" && <AdminLeaveTab query={query} />}
      {tab === "academy" && <AcademyClosureTab />}
    </div>
  );
}

function studentSearchFilter(query: string | undefined): Prisma.LeaveRequestWhereInput {
  if (!query) return {};
  return {
    student: {
      OR: [{ name: { contains: query, mode: "insensitive" } }, { loginId: { contains: query, mode: "insensitive" } }],
    },
  };
}

// 학생이 본인 수업을 직접 휴강 처리한 내역만 보여준다 — 조회 전용(관리자가 여기서
// 새로 만들 일은 없다. 학생연기를 대신 등록하려면 "관리자휴강내역" 탭의 등록폼을 쓴다).
async function StudentLeaveTab({ query }: { query: string | undefined }) {
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: { siteId: DEFAULT_SITE_ID, requestedByRole: "STUDENT", academyClosureId: null, ...studentSearchFilter(query) },
    orderBy: { createdAt: "desc" },
    include: { student: true, classSession: { include: { teacher: { select: TEACHER_SUMMARY_SELECT } } } },
    take: 100,
  });

  return (
    <LeaveRequestTable
      leaveRequests={leaveRequests}
      emptyText={query ? "검색 결과가 없습니다." : "학생이 직접 신청한 휴강 내역이 없습니다."}
    />
  );
}

// 관리자/매니저가 개별 학생의 수업 하나를 휴강 처리한 내역 + 강사 Hold 신청(승인 대기
// 포함, 관리자가 최종 승인/거부하는 주체이므로 이 탭에 함께 둔다).
async function AdminLeaveTab({ query }: { query: string | undefined }) {
  const [leaveRequests, scheduledSessions] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        siteId: DEFAULT_SITE_ID,
        requestedByRole: { in: ["ADMIN", "MANAGER", "TEACHER"] },
        academyClosureId: null,
        ...studentSearchFilter(query),
      },
      orderBy: { createdAt: "desc" },
      include: { student: true, classSession: { include: { teacher: { select: TEACHER_SUMMARY_SELECT } } } },
      take: 100,
    }),
    prisma.classSession.findMany({
      where: { siteId: DEFAULT_SITE_ID, status: "SCHEDULED", deletedAt: null },
      orderBy: { scheduledAt: "asc" },
      include: { student: true, teacher: { select: TEACHER_SUMMARY_SELECT } },
      take: 200,
    }),
  ]);

  const options = scheduledSessions.map((s) => ({
    id: s.id,
    label: `${fmtDateTime(s.scheduledAt)} · ${s.student.name} 학생 · ${s.teacher.realName} 강사`,
  }));

  return (
    <>
      <CreateLeaveForm options={options} />
      <LeaveRequestTable
        leaveRequests={leaveRequests}
        emptyText={query ? "검색 결과가 없습니다." : "관리자·강사 휴강/Hold 내역이 없습니다."}
      />
    </>
  );
}

type LeaveRequestRow = Prisma.LeaveRequestGetPayload<{
  include: { student: true; classSession: { include: { teacher: { select: typeof TEACHER_SUMMARY_SELECT } } } };
}>;

function LeaveRequestTable({ leaveRequests, emptyText }: { leaveRequests: LeaveRequestRow[]; emptyText: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1150px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <th className="px-4 py-3">신청 유형</th>
            <th className="px-4 py-3">신청일</th>
            <th className="px-4 py-3">학생</th>
            <th className="px-4 py-3">강사</th>
            <th className="px-4 py-3">휴강한 수업 일시</th>
            <th className="px-4 py-3">사유</th>
            <th className="px-4 py-3">연장일</th>
            <th className="px-4 py-3">상태</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {leaveRequests.map((lr) => (
            <tr key={lr.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 text-slate-600">{REQUEST_TYPE_LABEL[lr.requestedByRole] ?? lr.requestedByRole}</td>
              <td className="px-4 py-3 text-slate-500">{fmtDateTime(lr.createdAt)}</td>
              <td className="px-4 py-3 font-medium text-slate-900">{lr.student.name}</td>
              <td className="px-4 py-3 text-slate-600">{lr.classSession.teacher.realName}</td>
              <td className="px-4 py-3 text-slate-600">{fmtDateTime(lr.classSession.scheduledAt)}</td>
              <td className="px-4 py-3 text-slate-500">{lr.reason ?? "-"}</td>
              <td className="px-4 py-3 text-slate-600">+{lr.extendedDays}일</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[lr.status]}`}>
                  {STATUS_LABEL[lr.status]}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {lr.status === "PENDING" ? (
                  <ApproveRejectButtons
                    approveAction={approveLeaveRequest.bind(null, lr.id)}
                    rejectAction={rejectLeaveRequest.bind(null, lr.id)}
                  />
                ) : lr.status === "APPROVED" ? (
                  <RevertButton action={revertLeaveRequest.bind(null, lr.id)} />
                ) : (
                  <span className="text-xs text-slate-300">-</span>
                )}
              </td>
            </tr>
          ))}
          {leaveRequests.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// 어학원 전체 휴강 — 캘린더에서 날짜를 고르고 사유를 적으면 그날 예정된 모든 수업을
// 한 번에 휴강 처리한다(등록 폼은 AcademyClosureCalendar 안에 있다). 그 사유는
// LeaveRequest.reason으로 그대로 저장되므로, 학생 페이지(students/[id]/sessions,
// student/sessions)에도 개별 휴강과 똑같이 자동으로 노출된다.
async function AcademyClosureTab() {
  const [closures, allLeaveRequests] = await Promise.all([
    prisma.academyClosure.findMany({
      where: { siteId: DEFAULT_SITE_ID },
      orderBy: { date: "desc" },
      include: { _count: { select: { leaveRequests: true } } },
      take: 100,
    }),
    // 달력에서 날짜를 클릭했을 때 그 날짜에 이미 걸려있는 연기 기록(학생·관리자·
    // 어학원 휴강 전부)을 보여주기 위해 최근 것 위주로 넉넉히 가져온다.
    prisma.leaveRequest.findMany({
      where: { siteId: DEFAULT_SITE_ID },
      orderBy: { createdAt: "desc" },
      include: { student: true, classSession: { include: { teacher: { select: TEACHER_SUMMARY_SELECT } } } },
      take: 500,
    }),
  ]);

  const recordsByDate = new Map<
    string,
    { type: string; studentName: string; teacherName: string; time: string; reason: string | null }[]
  >();
  for (const lr of allLeaveRequests) {
    const key = formatAppDate(lr.classSession.scheduledAt);
    const list = recordsByDate.get(key) ?? [];
    list.push({
      type: REQUEST_TYPE_LABEL[lr.requestedByRole] ?? lr.requestedByRole,
      studentName: lr.student.name,
      teacherName: lr.classSession.teacher.realName,
      time: fmtDateTime(lr.classSession.scheduledAt).slice(-5),
      reason: lr.reason,
    });
    recordsByDate.set(key, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <AcademyClosureCalendar
        closedDates={closures.map((c) => formatAppDate(c.date))}
        recordsByDate={Object.fromEntries(recordsByDate)}
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">휴강 날짜</th>
              <th className="px-4 py-3">사유</th>
              <th className="px-4 py-3">영향받은 수업 수</th>
              <th className="px-4 py-3">등록일시</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {closures.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium text-slate-900">{formatAppDate(c.date)}</td>
                <td className="px-4 py-3 text-slate-600">{c.reason}</td>
                <td className="px-4 py-3 text-slate-600">{c._count.leaveRequests}건</td>
                <td className="px-4 py-3 text-slate-500">{fmtDateTime(c.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <AcademyClosureRevertButton
                    affectedCount={c._count.leaveRequests}
                    action={revertAcademyClosure.bind(null, c.id)}
                  />
                </td>
              </tr>
            ))}
            {closures.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  등록된 전체수업휴강이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
