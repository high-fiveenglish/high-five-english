import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { TEACHER_SUMMARY_SELECT } from "@/lib/teacherSelect";
import { computeBasePriceKRW } from "@/lib/enrollmentPricing";
import { EnrollmentCreateForm } from "../../new/EnrollmentCreateForm";
import { parseScheduleDaysLabel } from "../../scheduleUtils";
import { PaymentForm } from "./PaymentForm";

export default async function EditEnrollmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const enrollmentId = Number(id);

  const [enrollment, teachers] = await Promise.all([
    prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { student: true } }),
    prisma.teacher.findMany({ where: { siteId: DEFAULT_SITE_ID }, orderBy: { realName: "asc" }, select: TEACHER_SUMMARY_SELECT }),
  ]);

  if (!enrollment) notFound();

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
