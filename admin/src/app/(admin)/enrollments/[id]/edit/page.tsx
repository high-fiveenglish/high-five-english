import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { computeBasePriceKRW } from "@/lib/enrollmentPricing";
import { EnrollmentCreateForm } from "../../new/EnrollmentCreateForm";
import { parseScheduleDaysLabel } from "../../scheduleUtils";
import { PaymentForm } from "./PaymentForm";
import { requirePageActor, requirePageInScope } from "@/lib/pageAccess";
import { parseRouteId } from "@/lib/routeId";

export default async function EditEnrollmentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor("enrollments.update");
  const { id } = await params;
  const enrollmentId = parseRouteId(id);
  if (enrollmentId === null) notFound();
  // 협력사 계정은 다른 협력사/본사 직영 수강 id를 직접 입력해도 어떤 데이터도 읽기 전에 404
  await requirePageInScope(actor, "enrollment", enrollmentId);

  const [enrollment, teachers] = await Promise.all([
    prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { student: true } }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" }, select: TEACHER_SUMMARY_SELECT }),
  ]);

  if (!enrollment) notFound();

  // 수업 생성 배치로 이미 만들어진 수업이 있으면 안내한다 — 요일/시각/종료일을 바꿔도 그 수업들은 자동으로 바뀌지 않는다
  // (강사/수업 시간 변경만 예정 수업에 반영된다. 자동 재동기화는 아직 없음).
  let generatedSessionCount = 0;
  try {
    generatedSessionCount = await prisma.classSession.count({ where: { enrollmentId, generationBatchId: { not: null }, deletedAt: null } });
  } catch {
    generatedSessionCount = 0; // 마이그레이션 적용 전에는 컬럼이 없다 — 수정 화면은 계속 열려야 한다.
  }

  const weekdayCount = parseScheduleDaysLabel(enrollment.scheduleDays).length;
  const basePriceKRW = await computeBasePriceKRW(enrollment.packageMonths, weekdayCount, enrollment.classDurationMin);

  const classTimes =
    enrollment.classTimes && typeof enrollment.classTimes === "object"
      ? Object.fromEntries(
          Object.entries(enrollment.classTimes as Record<string, string>).map(([k, v]) => [Number(k), v]),
        )
      : {};

  return (
    <div>
      <Link href="/enrollments" className="mb-4 inline-block text-xs font-semibold text-slate-500 hover:underline">
        ← 수강내역관리로
      </Link>
      <h1 className="mb-6 text-xl font-bold text-slate-900">수강내역 수정 — {enrollment.student.name}</h1>

      {generatedSessionCount > 0 && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          이 수강에는 일정으로부터 자동 생성된 수업이 {generatedSessionCount}건 있습니다. 수업 요일·시각·시작일·종료일을 바꿔도 이미 생성된 수업은
          자동으로 바뀌지 않습니다(강사와 수업 시간 변경만 예정 수업에 반영됩니다). 일정 변경이 필요하면 수업 관리에서 개별 수업을 확인해 주세요.
        </p>
      )}

      <EnrollmentCreateForm
        mode="edit"
        enrollmentId={enrollment.id}
        students={[]}
        teachers={teachers.map((t) => ({ id: t.id, label: t.realName }))}
        lockStudent
        studentLabel={`${enrollment.student.loginId} (${enrollment.student.name})`}
        studentName={enrollment.student.name}
        defaultEnglishName={enrollment.student.englishName}
        initialValues={{
          classMethod: enrollment.classMethod,
          studentLevel: enrollment.studentLevel ?? "",
          textbookName: enrollment.textbookName ?? "",
          curriculum: enrollment.curriculum ?? "",
          scheduleDayValues: parseScheduleDaysLabel(enrollment.scheduleDays),
          classDurationMin: enrollment.classDurationMin,
          packageMonths: enrollment.packageMonths,
          totalSessions: enrollment.totalSessions,
          startDate: enrollment.startDate.toISOString().slice(0, 10),
          classTime: enrollment.classTime ?? "",
          dayTimes: classTimes,
          teacherId: enrollment.teacherId,
          studentEnglishName: enrollment.studentEnglishName ?? "",
          adminNote: enrollment.adminNote ?? "",
        }}
      />

      <div className="mt-8">
        <PaymentForm
          enrollmentId={enrollment.id}
          basePriceKRW={basePriceKRW}
          defaultActualPriceKRW={enrollment.actualPriceKRW ?? basePriceKRW ?? 0}
          paymentStatus={enrollment.paymentStatus}
        />
      </div>
    </div>
  );
}
