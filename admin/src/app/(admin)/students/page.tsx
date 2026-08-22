import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { deleteStudent, restoreStudent } from "./actions";
import { GRADE_LABEL, STATUS_LABEL } from "./constants";
import { AgentSelect } from "./AgentSelect";
import { GradeSelect } from "./GradeSelect";
import { ConsultationNoteModal } from "./ConsultationNoteModal";
import { ImpersonateButton } from "./ImpersonateButton";
import { StudentDeleteButton } from "./StudentDeleteButton";
import { RestoreStudentButton } from "./RestoreStudentButton";

function fmtDateTime(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const showDeleted = filter === "deleted";

  const [students, agents] = await Promise.all([
    prisma.student.findMany({
      where: { siteId: DEFAULT_SITE_ID, deletedAt: showDeleted ? { not: null } : null },
      orderBy: { id: "desc" },
      include: {
        agent: true,
        consultationNotes: { orderBy: { createdAt: "desc" } },
        enrollments: { orderBy: { id: "desc" }, take: 1 },
      },
    }),
    prisma.agent.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { name: "asc" } }),
  ]);

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

      <div className="mb-4 flex gap-2 text-sm">
        <Link
          href="/students"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            !showDeleted ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          활성 회원
        </Link>
        <Link
          href="/students?filter=deleted"
          className={`rounded-lg px-3 py-1.5 font-medium ${
            showDeleted ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          삭제된 회원
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-3 py-3">협력사</th>
              <th className="px-3 py-3">회원등급</th>
              <th className="px-3 py-3">이름 / 아이디</th>
              <th className="px-3 py-3">수강상태</th>
              <th className="px-3 py-3">가입일</th>
              <th className="px-3 py-3">관리</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => {
              const latest = s.enrollments[0];
              return (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3">
                    {showDeleted ? (
                      <span className="text-slate-500">{s.agent?.name ?? "미지정"}</span>
                    ) : (
                      <AgentSelect studentId={s.id} agentId={s.agentId} agents={agents} />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {showDeleted ? (
                      <span className="text-slate-500">{GRADE_LABEL[s.grade]}</span>
                    ) : (
                      <GradeSelect studentId={s.id} grade={s.grade} />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/students/${s.id}`} className="font-medium text-slate-900 hover:underline">
                      {s.name}
                    </Link>
                    <span className="ml-1.5 text-xs text-slate-400">{s.loginId}</span>
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
                        <ImpersonateButton studentId={s.id} studentName={s.name} />
                        <Link
                          href={`/level-tests/new?studentId=${s.id}`}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          레벨테스트 등록
                        </Link>
                        <Link
                          href={`/enrollments/new?studentId=${s.id}`}
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
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {showDeleted ? "삭제된 회원이 없습니다." : "등록된 학생이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
