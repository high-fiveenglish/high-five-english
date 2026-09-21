import ExcelJS from "exceljs";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission } from "@/lib/rbac";
import { buildTeacherStats } from "@/lib/teacherStats";
import { parseAppDateTime } from "@/lib/appTime";

// 대시보드 "강사수업통계" 카드의 "엑셀 다운로드" — 매달 손으로 만들던 강사 급여 엑셀과
// 같은 구조(RawData/Summary 두 시트)로 내려준다. 이 라우트는 (admin) 레이아웃 밖의
// 일반 API 라우트라 layout.tsx의 인증이 자동으로 걸리지 않으므로, 여기서 직접
// requireBackofficeActor/requirePermission을 호출한다.
export async function GET(request: Request) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "teacher_stats.view");

  const url = new URL(request.url);
  const fromRaw = url.searchParams.get("from") ?? "";
  const toRaw = url.searchParams.get("to") ?? "";
  const from = parseAppDateTime(`${fromRaw}T00:00`);
  // to는 "포함" 개념이라, 실제 쿼리는 다음날 00:00 미만으로 잡는다.
  const to = parseAppDateTime(`${toRaw}T00:00`);
  to.setUTCDate(to.getUTCDate() + 1);

  const { rows, summary } = await buildTeacherStats(from, to);

  const workbook = new ExcelJS.Workbook();

  const rawSheet = workbook.addWorksheet("RawData");
  rawSheet.columns = [
    { header: "강사명", key: "teacherName", width: 14 },
    { header: "학생명(영어이름)", key: "studentLabel", width: 20 },
    { header: "수업일자", key: "dateLabel", width: 12 },
    { header: "출결석", key: "attendance", width: 10 },
    { header: "시간(분)", key: "durationMin", width: 10 },
    { header: "협력사", key: "agentName", width: 14 },
    { header: "수업종류", key: "sessionUnits", width: 10 },
    { header: "급여(₱)", key: "payPHP", width: 12 },
  ];
  rawSheet.getRow(1).font = { bold: true };
  for (const r of rows) rawSheet.addRow(r);

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "강사명", key: "teacherName", width: 14 },
    { header: "레이트(25분/₱)", key: "ratePerUnit", width: 16 },
    { header: "출석 회차", key: "presentUnits", width: 10 },
    { header: "결석 회차", key: "absentUnits", width: 10 },
    { header: "유급휴가 건수", key: "paidLeaveCount", width: 12 },
    { header: "총 급여(₱)", key: "totalPayPHP", width: 14 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const r of summary) summarySheet.addRow(r);
  const totalRow = summarySheet.addRow({
    teacherName: "합계",
    totalPayPHP: summary.reduce((sum, r) => sum + r.totalPayPHP, 0),
  });
  totalRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="teacher-stats_${fromRaw}_${toRaw}.xlsx"`,
    },
  });
}
