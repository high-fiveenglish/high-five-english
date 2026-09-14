"use client";

import { useState } from "react";
import { formatAppDate, formatAppTime } from "@/lib/appTime";
import { SESSION_STATUS_LABEL_EN, ENGLISH_LEVEL_LABEL_EN, LEVEL_TEST_PROGRESS_LABEL_EN, studentDisplayName } from "@/lib/teacherPortalLabels";
import { EvaluationModal } from "./EvaluationModal";
import { LevelTestResultModal } from "./LevelTestResultModal";

export type TeacherCalendarSession = {
  id: number;
  scheduledAt: Date;
  durationMin: number;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "MAKEUP_NEEDED" | "LEAVE";
  progressNote: string | null;
  studentName: string;
  studentEnglishName: string | null;
  classMethod: string;
  textbookName: string | null;
  evaluationId: number | null;
  evaluationContent: string | null;
  isSupplement: boolean;
};

// 관리자가 수동으로 COMPLETED 처리해야만 평가서를 쓸 수 있던 방식 대신, 수업 시작
// 시각이 지난(취소/휴강이 아닌) 수업이면 강사가 바로 평가서를 작성할 수 있게 한다.
function canWriteEvaluation(s: TeacherCalendarSession): boolean {
  return s.status !== "CANCELLED" && s.status !== "LEAVE" && s.scheduledAt.getTime() <= Date.now();
}

export type TeacherCalendarLevelTest = {
  id: number;
  scheduledTestDate: Date;
  studentName: string;
  studentEnglishName: string | null;
  classMethod: string | null;
  englishLevel: string | null;
  progressStatus: string | null;
  teacherNote: string | null;
  resultContent: string | null;
  recommendedLevel: string | null;
  recommendedTextbook: string | null;
  scoreListening: number | null;
  scoreSpeakingFluency: number | null;
  scoreSpeakingGrammar: number | null;
  scoreVocabulary: number | null;
  scoreCompletion: number | null;
};

// canWriteEvaluation과 같은 이유 — 취소된 테스트가 아니고 예정 시각이 지났으면 결과를
// 쓸 수 있다. 다만 관리자가 이미 "수업완료/결석"으로 처리해둔 건은(예: 관리자가
// scheduledTestDate보다 먼저 결과를 입력해둔 경우) 그 처리 자체가 "이미 끝났다"는
// 확정 신호이므로, 예정 시각이 아직 안 지났더라도(데모 데이터처럼 날짜가 꼬인 경우
// 포함) 막지 않는다 — 안 그러면 이미 써둔 결과를 강사가 열람/수정조차 못 하게 된다.
function canWriteLevelTestResult(lt: TeacherCalendarLevelTest): boolean {
  if (lt.progressStatus === "취소") return false;
  if (lt.progressStatus === "수업완료" || lt.progressStatus === "결석") return true;
  return lt.scheduledTestDate.getTime() <= Date.now();
}

export type TeacherMeetingInfo = {
  teamsUrl: string | null;
  zoomUrl: string | null;
  tencentUrl: string | null;
};

const STATUS_LABEL = SESSION_STATUS_LABEL_EN;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// 학생 Dashboard의 CalendarView.tsx와 동일한 이유로 Asia/Seoul 기준 날짜 키를 쓴다 —
// 강사의 브라우저 타임존이 한국이 아니어도 항상 한국 달력 기준으로 묶여야 한다.
function dateKey(d: Date) {
  return formatAppDate(d);
}
const fmtDate = formatAppDate;
const fmtTime = formatAppTime;

// 강사 본인의 화상 접속 정보(강사 프로필에 등록된 값)로 바로 입장할 수 있도록 수업 방식에
// 맞는 링크로 연결한다. 강사 프로필에 해당 플랫폼의 링크가 없으면 텍스트로만 표시한다.
function PlatformCell({ classMethod, info }: { classMethod: string | null; info: TeacherMeetingInfo }) {
  const url =
    classMethod === "zoom" ? info.zoomUrl : classMethod === "tencent" ? info.tencentUrl : classMethod === "teams" ? info.teamsUrl : null;
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline">
        {classMethod}
      </a>
    );
  }
  return <span>{classMethod ?? "-"}</span>;
}

export function TeacherCalendarView({
  sessions,
  levelTests,
  teacherMeetingInfo,
}: {
  sessions: TeacherCalendarSession[];
  levelTests: TeacherCalendarLevelTest[];
  teacherMeetingInfo: TeacherMeetingInfo;
}) {
  const today = new Date();
  const initial = sessions.find((s) => s.scheduledAt >= today) ?? sessions[sessions.length - 1] ?? { scheduledAt: today };
  const [initialYear, initialMonth] = formatAppDate(initial.scheduledAt).split("-").map(Number);
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth - 1);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(dateKey(initial.scheduledAt));
  const [openEvalSession, setOpenEvalSession] = useState<TeacherCalendarSession | null>(null);
  const [openLevelTest, setOpenLevelTest] = useState<TeacherCalendarLevelTest | null>(null);

  const byDay = new Map<string, TeacherCalendarSession[]>();
  for (const s of sessions) {
    const key = dateKey(s.scheduledAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const classesForDay = (selectedDateKey ? byDay.get(selectedDateKey) : undefined) ?? [];

  const levelTestsByDay = new Map<string, TeacherCalendarLevelTest[]>();
  for (const lt of levelTests) {
    const key = dateKey(lt.scheduledTestDate);
    if (!levelTestsByDay.has(key)) levelTestsByDay.set(key, []);
    levelTestsByDay.get(key)!.push(lt);
  }
  const levelTestsForDay = (selectedDateKey ? levelTestsByDay.get(selectedDateKey) : undefined) ?? [];

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            const d = new Date(viewYear, viewMonth - 1, 1);
            setViewYear(d.getFullYear());
            setViewMonth(d.getMonth());
          }}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← Prev
        </button>
        <p className="text-sm font-bold text-slate-900">
          {viewYear}.{String(viewMonth + 1).padStart(2, "0")}
        </p>
        <button
          type="button"
          onClick={() => {
            const d = new Date(viewYear, viewMonth + 1, 1);
            setViewYear(d.getFullYear());
            setViewMonth(d.getMonth());
          }}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
        >
          Next →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 font-semibold text-slate-400">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = dateKey(d);
          const daySessions = byDay.get(key) ?? [];
          const dayLevelTests = levelTestsByDay.get(key) ?? [];
          const isToday = key === dateKey(today);
          const isSelected = key === selectedDateKey;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDateKey(key)}
              className={`min-h-[64px] rounded-lg border p-1 text-left ${
                isSelected ? "border-slate-900 ring-1 ring-slate-900" : isToday ? "border-slate-400 bg-slate-50" : "border-slate-100"
              }`}
            >
              <p className="text-[11px] text-slate-400">{d.getDate()}</p>
              {daySessions.length > 0 && (
                <span className="mt-0.5 block w-fit rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold text-slate-600">
                  {daySessions.length} {daySessions.length === 1 ? "class" : "classes"}
                </span>
              )}
              {daySessions.some((s) => s.isSupplement) && (
                <span className="mt-0.5 block w-fit rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-700">
                  Makeup
                </span>
              )}
              {dayLevelTests.length > 0 && (
                <span className="mt-0.5 block w-fit rounded bg-violet-100 px-1 py-0.5 text-[10px] font-bold text-violet-700">
                  Level Test
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDateKey && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-bold text-slate-900">{selectedDateKey} Level Test</p>
          {levelTestsForDay.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              No level tests scheduled for this date.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Level</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Comment</th>
                    <th className="px-4 py-3">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {levelTestsForDay.map((lt) => (
                    <tr key={lt.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-semibold text-slate-900">{fmtTime(lt.scheduledTestDate)}</td>
                      <td className="px-4 py-3 text-slate-600">{studentDisplayName(lt.studentName, lt.studentEnglishName)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <PlatformCell classMethod={lt.classMethod} info={teacherMeetingInfo} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {lt.englishLevel ? (ENGLISH_LEVEL_LABEL_EN[lt.englishLevel] ?? lt.englishLevel) : "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {lt.progressStatus ? (LEVEL_TEST_PROGRESS_LABEL_EN[lt.progressStatus] ?? lt.progressStatus) : "-"}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate-500" title={lt.teacherNote ?? undefined}>
                        {lt.teacherNote ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        {canWriteLevelTestResult(lt) ? (
                          <button
                            type="button"
                            onClick={() => setOpenLevelTest(lt)}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold hover:underline ${
                              lt.resultContent ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"
                            }`}
                          >
                            {lt.resultContent ? "Done" : "Not written"}
                          </button>
                        ) : (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-400">
                            {lt.resultContent ? "Done" : "Not written"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedDateKey && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-bold text-slate-900">{selectedDateKey} Classes</p>
          {classesForDay.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              No classes scheduled for this date.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Duration (min)</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Textbook</th>
                    <th className="px-4 py-3">Progress</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Evaluation</th>
                  </tr>
                </thead>
                <tbody>
                  {classesForDay.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-semibold text-slate-900">{fmtTime(s.scheduledAt)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {studentDisplayName(s.studentName, s.studentEnglishName)}
                        {s.isSupplement && (
                          <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                            Makeup
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{s.durationMin}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <PlatformCell classMethod={s.classMethod} info={teacherMeetingInfo} />
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 text-slate-600" title={s.textbookName ?? undefined}>
                        {s.textbookName ?? "-"}
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-slate-500" title={s.progressNote ?? undefined}>
                        {s.progressNote ?? "No record"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{STATUS_LABEL[s.status]}</td>
                      <td className="px-4 py-3">
                        {canWriteEvaluation(s) ? (
                          <button
                            type="button"
                            onClick={() => setOpenEvalSession(s)}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold hover:underline ${
                              s.evaluationId ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"
                            }`}
                          >
                            {s.evaluationId ? "Done" : "Not written"}
                          </button>
                        ) : (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-400">
                            {s.evaluationId ? "Done" : "Not written"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {openEvalSession && (
        <EvaluationModal
          sessionId={openEvalSession.id}
          defaultContent={openEvalSession.evaluationContent ?? ""}
          studentLabel={studentDisplayName(openEvalSession.studentName, openEvalSession.studentEnglishName)}
          metaLine={`${fmtDate(openEvalSession.scheduledAt)} ${fmtTime(openEvalSession.scheduledAt)} · ${openEvalSession.durationMin} min · ${openEvalSession.classMethod}`}
          onClose={() => setOpenEvalSession(null)}
        />
      )}

      {openLevelTest && (
        <LevelTestResultModal
          levelTestId={openLevelTest.id}
          defaults={{
            recommendedLevel: openLevelTest.recommendedLevel ?? "",
            recommendedTextbook: openLevelTest.recommendedTextbook ?? "",
            scoreListening: openLevelTest.scoreListening,
            scoreSpeakingFluency: openLevelTest.scoreSpeakingFluency,
            scoreSpeakingGrammar: openLevelTest.scoreSpeakingGrammar,
            scoreVocabulary: openLevelTest.scoreVocabulary,
            scoreCompletion: openLevelTest.scoreCompletion,
            resultContent: openLevelTest.resultContent ?? "",
          }}
          studentLabel={studentDisplayName(openLevelTest.studentName, openLevelTest.studentEnglishName)}
          metaLine={`${fmtDate(openLevelTest.scheduledTestDate)} ${fmtTime(openLevelTest.scheduledTestDate)}`}
          onClose={() => setOpenLevelTest(null)}
        />
      )}
    </div>
  );
}
