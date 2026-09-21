// 강사별 주간 수업 스케줄을 구글시트에 동기화한다. 수업/수강 관련 데이터가 바뀌는
// 지점(수강신청 저장, 상태 변경, 연기 처리 등)에서 이 모듈의 syncTeacherScheduleToGoogleSheet()를
// fire-and-forget(await 하지 않고 .catch만 붙여서)으로 호출한다 — 구글 API가 느리거나
// 실패해도 실제 관리자 작업(그 화면의 저장 등)은 절대 막히거나 실패하지 않아야 한다.
//
// 구글시트 접근에 필요한 서비스 계정 키(GOOGLE_SHEETS_CLIENT_EMAIL/GOOGLE_SHEETS_PRIVATE_KEY)와
// 대상 시트(GOOGLE_SHEETS_SPREADSHEET_ID)가 .env에 없으면 조용히 건너뛴다(콘솔 경고만 남김) —
// 이 기능이 아직 설정 안 된 환경(예: 로컬 개발)에서도 다른 기능이 깨지지 않게 하기 위함이다.
import { google, sheets_v4 } from "googleapis";
import { prisma } from "./prisma";
import { DEFAULT_SITE_ID } from "./constants";
import { AVAILABLE_TIME_SLOT_MINUTES, formatMinuteOfDay } from "./timeSlots";
import { appDayStart, formatAppDate } from "./appTime";
import { parseScheduleDaysLabel, resolveScheduleTime } from "@/app/(admin)/enrollments/scheduleUtils";

const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 월~일
const WEEKDAY_LABELS: Record<number, string> = { 0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토" };

type RgbColor = { red: number; green: number; blue: number };

// 셀 배경 = 협력사. 근무시간 관련 두 색(흰색/연핑크)과 겹치지 않는 톤으로 골랐다.
const AGENT_BG: Record<string, RgbColor> = {
  highfive: { red: 0.85, green: 0.92, blue: 1 }, // 본사 — 연파랑
  mnmenglish: { red: 0.87, green: 0.95, blue: 0.87 }, // 맘앤맘 — 연초록
  synergyenglish: { red: 0.93, green: 0.88, blue: 0.98 }, // 시너지 — 연보라
};
const DEFAULT_AGENT_BG = AGENT_BG.highfive;

const WORKING_NO_CLASS_BG: RgbColor = { red: 1, green: 1, blue: 1 }; // 근무시간, 수업 없음 — 흰색
const OFF_HOURS_BG: RgbColor = { red: 0.99, green: 0.87, blue: 0.9 }; // 근무시간 아님 — 연한 핑크
// 상담 단계 가예약 — 실제 수업(협력사 색)·근무시간 색과 겹치지 않는 주황빛 노랑으로
// 구분한다. 등록으로 전환되면 실제 수업으로 바뀌어 이 색이 사라진다.
const RESERVED_BG: RgbColor = { red: 1, green: 0.87, blue: 0.5 };
const FONT_RESERVED = { color: { red: 0.55, green: 0.35, blue: 0 } as RgbColor, bold: true };

// 글자색·굵기 = 종료 상태
const FONT_NORMAL = { color: { red: 0.1, green: 0.1, blue: 0.1 } as RgbColor, bold: false };
const FONT_ENDING_TODAY = { color: { red: 0.8, green: 0.1, blue: 0.1 } as RgbColor, bold: true }; // 당일 종료 — 빨강
const FONT_ENDED_RECENT = { color: { red: 0.85, green: 0.45, blue: 0.05 } as RgbColor, bold: true }; // 종료 1~2일 — 주황
const FONT_ENDED_STALE = { color: { red: 0.6, green: 0.6, blue: 0.6 } as RgbColor, bold: false }; // 종료 3일+ — 회색

// 종료된 지 이보다 오래된 수강 건은 시트에서 아예 뺀다(계속 쌓이지 않도록).
const ENDED_GRACE_DAYS = 7;

type ScheduleCell = { text: string; bg: RgbColor; font: { color: RgbColor; bold: boolean } };
type TeacherBlock = { teacherName: string; grid: ScheduleCell[][] }; // grid[weekdayRow][timeSlotCol]

async function buildTeacherGrids(): Promise<TeacherBlock[]> {
  const teachers = await prisma.teacher.findMany({
    where: { siteId: DEFAULT_SITE_ID, accountStatus: "ACTIVE" },
    orderBy: [{ priority: "desc" }, { realName: "asc" }],
    select: { id: true, realName: true, availableHours: true },
  });

  const todayStart = appDayStart();
  const today = formatAppDate(new Date());
  const graceStart = new Date(todayStart);
  graceStart.setUTCDate(graceStart.getUTCDate() - ENDED_GRACE_DAYS);

  const teacherIds = teachers.map((t) => t.id);
  const enrollments = await prisma.enrollment.findMany({
    where: {
      siteId: DEFAULT_SITE_ID,
      teacherId: { in: teacherIds },
      OR: [
        { status: { in: ["ACTIVE", "PAID", "HOLDING"] } },
        { status: "COMPLETED", endDate: { gte: graceStart } },
      ],
    },
    select: {
      teacherId: true,
      scheduleDays: true,
      classTime: true,
      classTimes: true,
      classDurationMin: true,
      classMethod: true,
      endDate: true,
      status: true,
      student: { select: { name: true, consultRoute: true } },
      agent: { select: { code: true } },
    },
  });

  const byTeacher = new Map<number, typeof enrollments>();
  for (const e of enrollments) {
    if (!e.teacherId) continue;
    byTeacher.set(e.teacherId, [...(byTeacher.get(e.teacherId) ?? []), e]);
  }

  // 상담 단계 가예약(SlotReservation) — 등록전환/취소되면 status가 바뀌어 여기 더 이상
  // 잡히지 않으므로, 매번 RESERVED인 것만 다시 그린다.
  const reservations = await prisma.slotReservation.findMany({
    where: { siteId: DEFAULT_SITE_ID, teacherId: { in: teacherIds }, status: "RESERVED" },
    select: {
      teacherId: true,
      weekday: true,
      classTime: true,
      durationMin: true,
      prospectName: true,
      agent: { select: { name: true } },
    },
  });
  const reservationsByTeacher = new Map<number, typeof reservations>();
  for (const r of reservations) {
    reservationsByTeacher.set(r.teacherId, [...(reservationsByTeacher.get(r.teacherId) ?? []), r]);
  }

  return teachers.map((t) => {
    const availSet = new Set(t.availableHours);
    const grid: ScheduleCell[][] = WEEKDAY_DISPLAY_ORDER.map(() =>
      AVAILABLE_TIME_SLOT_MINUTES.map((minute) => ({
        text: "",
        bg: availSet.has(minute) ? WORKING_NO_CLASS_BG : OFF_HOURS_BG,
        font: FONT_NORMAL,
      })),
    );

    for (const e of byTeacher.get(t.id) ?? []) {
      const weekdays = parseScheduleDaysLabel(e.scheduleDays);
      let font = FONT_NORMAL;
      if (e.status === "COMPLETED") {
        const endMs = new Date(`${formatAppDate(e.endDate)}T00:00:00Z`).getTime();
        const daysSince = Math.round((todayStart.getTime() - endMs) / 86400000);
        font = daysSince >= 3 ? FONT_ENDED_STALE : FONT_ENDED_RECENT;
      } else if (formatAppDate(e.endDate) === today) {
        font = FONT_ENDING_TODAY;
      }
      const bg = e.agent?.code ? (AGENT_BG[e.agent.code] ?? DEFAULT_AGENT_BG) : DEFAULT_AGENT_BG;

      // 위챗으로 상담하는 학생은 이름 앞에 w, 수업 프로그램(줌/텐센트/팀즈)은 이름 뒤에
      // 괄호로 표시 — 레거시 사이트 스케줄표 표기 방식을 그대로 따른다.
      const wechatPrefix = e.student.consultRoute === "WECHAT" ? "w" : "";
      const methodSuffix = e.classMethod ? ` (${e.classMethod})` : "";
      const displayName = `${wechatPrefix}${e.student.name}${methodSuffix}`;

      for (const day of weekdays) {
        const time = resolveScheduleTime(e.classTime, e.classTimes, day);
        if (!time) continue;
        const rowIdx = WEEKDAY_DISPLAY_ORDER.indexOf(day);
        if (rowIdx === -1) continue;
        const [h, m] = time.split(":").map(Number);
        const startMinute = h * 60 + m;
        const endMinute = startMinute + e.classDurationMin;
        for (let minute = Math.floor(startMinute / 30) * 30; minute < endMinute; minute += 30) {
          const colIdx = AVAILABLE_TIME_SLOT_MINUTES.indexOf(minute);
          if (colIdx === -1) continue;
          grid[rowIdx][colIdx] = { text: displayName, bg, font };
        }
      }
    }

    // 가예약은 실제 수업이 이미 그려진 칸을 덮어쓰지 않는다(예약이 정상적으로 등록
    // 전환됐는데 status 갱신이 지연된 경우 등 방어적으로) — 빈 칸에만 표시한다.
    for (const r of reservationsByTeacher.get(t.id) ?? []) {
      const rowIdx = WEEKDAY_DISPLAY_ORDER.indexOf(r.weekday);
      if (rowIdx === -1) continue;
      const [h, m] = r.classTime.split(":").map(Number);
      const startMinute = h * 60 + m;
      const endMinute = startMinute + r.durationMin;
      const label = `예약:${r.prospectName}${r.agent ? ` (${r.agent.name})` : ""}`;
      for (let minute = Math.floor(startMinute / 30) * 30; minute < endMinute; minute += 30) {
        const colIdx = AVAILABLE_TIME_SLOT_MINUTES.indexOf(minute);
        if (colIdx === -1) continue;
        if (grid[rowIdx][colIdx].text) continue;
        grid[rowIdx][colIdx] = { text: label, bg: RESERVED_BG, font: FONT_RESERVED };
      }
    }

    return { teacherName: t.realName, grid };
  });
}

function getSheetsClient(): sheets_v4.Sheets | null {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!email || !rawKey) return null;
  const auth = new google.auth.JWT({
    email,
    key: rawKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

const ROWS_PER_BLOCK = 1 /* 강사명 배너 */ + 1 /* 시간 헤더 */ + 7 /* 요일 */ + 1 /* 여백 */;
const COLS = 1 /* 요일 라벨 */ + AVAILABLE_TIME_SLOT_MINUTES.length;
const SHEET_ID = 0;

function bannerRowRequest(startRow: number, teacherName: string): sheets_v4.Schema$Request {
  return {
    updateCells: {
      range: { sheetId: SHEET_ID, startRowIndex: startRow, endRowIndex: startRow + 1, startColumnIndex: 0, endColumnIndex: COLS },
      rows: [
        {
          values: [
            {
              userEnteredValue: { stringValue: `Teacher ${teacherName}` },
              userEnteredFormat: {
                backgroundColor: { red: 0.75, green: 0.2, blue: 0.22 },
                textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true },
                horizontalAlignment: "CENTER",
                verticalAlignment: "MIDDLE",
              },
            },
          ],
        },
      ],
      fields: "userEnteredValue,userEnteredFormat",
    },
  };
}

function mergeRequest(startRow: number): sheets_v4.Schema$Request {
  return {
    mergeCells: {
      range: { sheetId: SHEET_ID, startRowIndex: startRow, endRowIndex: startRow + 1, startColumnIndex: 0, endColumnIndex: COLS },
      mergeType: "MERGE_ALL",
    },
  };
}

function timeHeaderRowRequest(startRow: number): sheets_v4.Schema$Request {
  const values: sheets_v4.Schema$CellData[] = [
    {
      userEnteredValue: { stringValue: "TIME" },
      userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" },
    },
    ...AVAILABLE_TIME_SLOT_MINUTES.map((minute) => ({
      userEnteredValue: { stringValue: formatMinuteOfDay(minute) },
      userEnteredFormat: {
        textFormat: { bold: true, fontSize: 8 },
        backgroundColor: { red: 0.85, green: 0.85, blue: 0.85 } as RgbColor,
        horizontalAlignment: "CENTER" as const,
        verticalAlignment: "MIDDLE" as const,
      },
    })),
  ];
  return {
    updateCells: {
      range: { sheetId: SHEET_ID, startRowIndex: startRow, endRowIndex: startRow + 1, startColumnIndex: 0, endColumnIndex: COLS },
      rows: [{ values }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  };
}

function dayRowRequest(startRow: number, weekday: number, cells: ScheduleCell[]): sheets_v4.Schema$Request {
  const values: sheets_v4.Schema$CellData[] = [
    {
      userEnteredValue: { stringValue: WEEKDAY_LABELS[weekday] },
      userEnteredFormat: { textFormat: { bold: true }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" },
    },
    ...cells.map((cell) => ({
      userEnteredValue: { stringValue: cell.text },
      userEnteredFormat: {
        backgroundColor: cell.bg,
        textFormat: { foregroundColor: cell.font.color, bold: cell.font.bold, fontSize: 8 },
        wrapStrategy: "CLIP" as const,
        horizontalAlignment: "CENTER" as const,
        verticalAlignment: "MIDDLE" as const,
      },
    })),
  ];
  return {
    updateCells: {
      range: { sheetId: SHEET_ID, startRowIndex: startRow, endRowIndex: startRow + 1, startColumnIndex: 0, endColumnIndex: COLS },
      rows: [{ values }],
      fields: "userEnteredValue,userEnteredFormat",
    },
  };
}

export async function syncTeacherScheduleToGoogleSheet(): Promise<void> {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const sheets = getSheetsClient();
    if (!sheets || !spreadsheetId) {
      console.warn("[teacherScheduleSheet] GOOGLE_SHEETS_* 환경변수가 없어 동기화를 건너뜁니다.");
      return;
    }

    const blocks = await buildTeacherGrids();
    const totalRows = Math.max(blocks.length * ROWS_PER_BLOCK, 1);

    const requests: sheets_v4.Schema$Request[] = [
      {
        updateSheetProperties: {
          properties: { sheetId: SHEET_ID, gridProperties: { rowCount: totalRows + 2, columnCount: COLS + 1 } },
          fields: "gridProperties.rowCount,gridProperties.columnCount",
        },
      },
    ];

    blocks.forEach((block, blockIdx) => {
      const startRow = blockIdx * ROWS_PER_BLOCK;
      requests.push(bannerRowRequest(startRow, block.teacherName));
      requests.push(mergeRequest(startRow));
      requests.push(timeHeaderRowRequest(startRow + 1));
      block.grid.forEach((cells, rowIdx) => {
        const weekday = WEEKDAY_DISPLAY_ORDER[rowIdx];
        requests.push(dayRowRequest(startRow + 2 + rowIdx, weekday, cells));
      });
    });

    // 컬럼 너비(요일 라벨은 좁게, 시간 칸은 사람 이름이 보일 정도로)도 처음 한 번 맞춰둔다.
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: SHEET_ID, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 60 },
        fields: "pixelSize",
      },
    });
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: SHEET_ID, dimension: "COLUMNS", startIndex: 1, endIndex: COLS },
        properties: { pixelSize: 68 },
        fields: "pixelSize",
      },
    });

    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  } catch (err) {
    console.error("[teacherScheduleSheet] 구글시트 동기화 실패:", err);
  }
}
