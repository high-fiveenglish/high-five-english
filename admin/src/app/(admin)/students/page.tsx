import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { deleteStudent, restoreStudent } from "./actions";
import { GRADE_LABEL, STATUS_LABEL } from "./constants";
import { ConsultationNoteModal } from "./ConsultationNoteModal";
import { ImpersonateButton } from "./ImpersonateButton";
import { StudentDeleteButton } from "./StudentDeleteButton";
import { RestoreStudentButton } from "./RestoreStudentButton";
import { formatAppDateTime } from "@/lib/appTime";

const fmtDateTime = formatAppDateTime;
const CONSULT_ROUTE_LABEL: Record<string, string> = { WECHAT: "위챗", KAKAOTALK: "카카오톡" };

const NOTICE_LABEL: Record<string, string> = {
  "level-test-created": "레벨테스트가 등록되었습니다.",
  "enrollment-created": "수강신청이 등록되었습니다.",
};

const PAGE_SIZE = 20;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; notice?: string; q?: string; page?: string }>;
}) {
  const { filter, notice, q, page: pageParam } = await searchParams;
  const showDeleted = filter === "deleted";
  const noticeText = notice ? NOTICE_LABEL[notice] : undefined;
  const query = q?.trim();
  const page = Math.max(1, Number(pageParam) || 1);

  const listWhere = {
    siteId: DEFAULT_SITE_ID,
    deletedAt: showDeleted ? { not: null } : null,
    ...(query
      ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { loginId: { contains: query, mode: "insensitive" as const } }] }
      : {}),
  };

  const [students, activeCount, deletedCount, matchingCount] = await Promise.all([
    prisma.student.findMany({
      where: listWhere,
      orderBy: { joinedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        agent: true,
        consultationNotes: { orderBy: { createdAt: "desc" } },
        enrollments: { orderBy: { id: "desc" }, take: 1 },
      },
    }),
    prisma.student.count({ where: { siteId: DEFAULT_SITE_ID, deletedAt: null } }),
    prisma.student.count({ where: { siteId: DEFAULT_SITE_ID, deletedAt: { not: null } } }),
    prisma.student.count({ where: listWhere }),
  ]);
  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (showDeleted) params.set("filter", "deleted");
    if (query) params.set("q", query);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/students?${qs}` : "/students";
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">학생 관리</h1>
        <Link
          href="/students/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          + 학생 등록
        </Link>
      </div>

      {noticeText && (
        <div className="mb-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
          {noticeText}
        </div>
      )}

      <div className="mb-4 flex gap-2 text-sm">
        <Link
          href="/students"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            !showDeleted ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          활성 회원 ({activeCount.toLocaleString()})
        </Link>
        <Link
          href="/students?filter=deleted"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            showDeleted ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          삭제된 회원 ({deletedCount.toLocaleString()})
        </Link>
      </div>

      <form className="mb-4 flex gap-2" method="get">
        {showDeleted && <input type="hidden" name="filter" value="deleted" />}
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="이름 또는 아이디로 검색"
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
            href={showDeleted ? "/students?filter=deleted" : "/students"}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:underline"
          >
            초기화
          </Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-3">No.</th>
              <th className="px-3 py-3">협력사</th>
              <th className="px-3 py-3">회원등급</th>
              <th className="px-3 py-3">이름 / 아이디</th>
              <th className="px-3 py-3">상담루트</th>
              <th className="px-3 py-3" />
              <th className="px-3 py-3">수강상태</th>
              <th className="px-3 py-3">가입일</th>
              <th className="px-3 py-3">관리</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const latest = s.enrollments[0];
              // 오래된 순으로 1부터 매긴 일련번호 — 현재 목록(필터/검색 반영)의 전체
              // 인원(matchingCount)에서 최신순 정렬상 위치를 빼서, 기존 사이트의 No.
              // 컬럼과 동일하게 가장 오래된 회원이 1번이 되도록 맞춘다.
              const no = matchingCount - ((page - 1) * PAGE_SIZE + i);
              return (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3 text-slate-500">{no}</td>
                  <td className="px-3 py-3">
                    <span className="text-slate-500">{s.agent?.name ?? "미지정"}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-slate-500">{GRADE_LABEL[s.grade]}</span>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/students/${s.id}`} className="font-medium text-slate-900 hover:underline">
                      {s.name}
                    </Link>
                    <span className="ml-1.5 text-xs text-slate-400">{s.loginId}</span>
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    {s.consultRoute ? CONSULT_ROUTE_LABEL[s.consultRoute] : "-"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {!showDeleted && <ImpersonateButton studentId={s.id} studentName={s.name} />}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        s.status === "ACTIVE"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                    {latest && (
                      <span className="ml-1.5 text-xs text-slate-400">
                        ~{latest.endDate.toISOString().slice(0, 10)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-500">{s.joinedAt.toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-3">
                    {showDeleted ? (
                      <RestoreStudentButton action={restoreStudent.bind(null, s.id)} />
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ConsultationNoteModal
                          studentId={s.id}
                          studentName={s.name}
                          notes={s.consultationNotes.map((n) => ({
                            id: n.id,
                            content: n.content,
                            createdAt: fmtDateTime(n.createdAt),
                          }))}
                        />
                        <Link
                          href={`/students/${s.id}/level-test`}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          레벨테스트 등록
                        </Link>
                        <Link
                          href={`/students/${s.id}/enrollment`}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          수강등록
                        </Link>
                        <Link
                          href={`/students/${s.id}`}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          수정
                        </Link>
                        <StudentDeleteButton studentName={s.name} action={deleteStudent.bind(null, s.id)} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {students.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  {showDeleted ? "삭제된 회원이 없습니다." : "등록된 학생이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Link
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 ${
              page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
            }`}
          >
            이전
          </Link>
          <span className="px-2 text-slate-500">
            {page} / {totalPages.toLocaleString()} 페이지 (총 {matchingCount.toLocaleString()}명)
          </span>
          <Link
            href={pageHref(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={`rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 ${
              page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-slate-50"
            }`}
          >
            다음
          </Link>
        </div>
      )}
    </div>
  );
}
