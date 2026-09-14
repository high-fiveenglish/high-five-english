"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useActionState } from "react";
import { createEnrollment, updateEnrollment, findAvailableTeachersForSchedule, type AvailableTeacher } from "../actions";
import { computeEndDate } from "../scheduleUtils";
import { WEEKDAYS } from "@/lib/weekdays";
import { CLASS_METHOD_OPTIONS } from "@/lib/levelTestOptions";
import { HALF_HOUR_TIME_OPTIONS } from "@/lib/timeOptions";
import { TEXTBOOK_OPTIONS } from "@/lib/textbookCatalog";
import { romanizeKoreanName } from "@/lib/koreanRomanization";

type TeacherOption = { id: number; label: string };
type StudentOption = { id: number; label: string; name: string; englishName: string | null };

export type EnrollmentInitialValues = {
  classMethod: string;
  studentLevel: string;
  textbookName: string;
  curriculum: string;
  scheduleDayValues: number[];
  classDurationMin: number;
  packageMonths: number;
  totalSessions: number;
  startDate: string;
  classTime: string;
  dayTimes: Record<number, string>;
  teacherId: number | null;
  studentEnglishName: string;
  adminNote: string;
};

// 화면에는 월~일 순서로 보여준다 — WEEKDAYS 배열 자체는 일(0)이 먼저라 그대로 렌더링하면
// "일월화수목금토"처럼 어색하게 나온다. 값(0~6)은 그대로, 표시 순서만 바꾼다.
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const ORDERED_WEEKDAYS = WEEKDAY_DISPLAY_ORDER.map((v) => WEEKDAYS.find((d) => d.value === v)!);

const PACKAGE_MONTHS_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const STUDENT_LEVEL_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));

// 총 회차 기본값 계산에 쓰는 한 달당 평균 주 수 — 공휴일/휴강 등은 고려하지 않는
// 단순 근사치이며, 등록 시점의 기본값일 뿐 관리자가 언제든 직접 수정할 수 있다.
const WEEKS_PER_MONTH = 4;

export function EnrollmentCreateForm({
  students,
  teachers,
  defaultStudentId = null,
  defaultClassMethod = null,
  lockStudent = false,
  studentLabel,
  studentName,
  defaultEnglishName,
  mode = "create",
  enrollmentId,
  initialValues,
}: {
  students: StudentOption[];
  teachers: TeacherOption[];
  defaultStudentId?: number | null;
  defaultClassMethod?: string | null;
  /** 학생관리 → 수강등록으로 들어온 경우, 또는 기존 건 수정 시 학생을 다시 검색/선택하지 못하도록 읽기전용으로 표시. */
  lockStudent?: boolean;
  studentLabel?: string;
  /** 영어 이름 기본값 계산에 쓰는 학생의 한글/원어 이름. */
  studentName: string;
  /** 학생이 회원가입 시 등록한 영어 이름 — 있으면 그대로 기본값으로 쓴다. */
  defaultEnglishName: string | null;
  /** "edit"이면 기존 Enrollment를 수정 — 학생은 항상 잠기고, initialValues로 각 필드를 채운다. */
  mode?: "create" | "edit";
  enrollmentId?: number;
  initialValues?: EnrollmentInitialValues;
}) {
  const isEdit = mode === "edit";
  const action = isEdit ? updateEnrollment.bind(null, enrollmentId!) : createEnrollment;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [checkedDays, setCheckedDays] = useState<number[]>(initialValues?.scheduleDayValues ?? []);
  const [packageMonths, setPackageMonths] = useState(initialValues?.packageMonths ?? 1);
  const [classDurationMin, setClassDurationMin] = useState(initialValues?.classDurationMin ?? 25);
  const [startDate, setStartDate] = useState(initialValues?.startDate ?? "");
  const [baseClassTime, setBaseClassTime] = useState(initialValues?.classTime ?? "");
  const [dayTimes, setDayTimes] = useState<Record<number, string>>(initialValues?.dayTimes ?? {});
  // 기존에 요일별로 다른 시각이 저장돼 있던 건(수정 모드)은 "다르게" 상태로 열어서
  // 저장된 값이 그대로 보이게 하고, 그 외엔 "모두 동일" 기본값으로 시작한다.
  const [sameTimeForAllDays, setSameTimeForAllDays] = useState(
    () => !(initialValues?.dayTimes && Object.keys(initialValues.dayTimes).length > 0),
  );
  const [totalSessions, setTotalSessions] = useState(initialValues ? String(initialValues.totalSessions) : "");
  // 편집 모드에서는 이미 저장된 총 회차를 그대로 보여줘야 하므로, 마운트 시점에
  // "주 회차 × 기간" 자동계산이 그 값을 덮어쓰지 않도록 처음부터 dirty로 시작한다.
  const [sessionsDirty, setSessionsDirty] = useState(isEdit);
  const [currentEnglishNameDefault, setCurrentEnglishNameDefault] = useState(defaultEnglishName);
  const [englishName, setEnglishName] = useState(
    initialValues?.studentEnglishName || defaultEnglishName || romanizeKoreanName(studentName) || "",
  );
  const [englishNameDirty, setEnglishNameDirty] = useState(isEdit);
  const [teacherId, setTeacherId] = useState(initialValues?.teacherId ? String(initialValues.teacherId) : "");
  const [availableTeachers, setAvailableTeachers] = useState<AvailableTeacher[] | null>(() => {
    if (!initialValues?.teacherId) return null;
    const t = teachers.find((x) => x.id === initialValues.teacherId);
    return t ? [t] : null;
  });
  const [searchPending, startSearch] = useTransition();

  const orderedCheckedDays = useMemo(
    () => WEEKDAY_DISPLAY_ORDER.filter((v) => checkedDays.includes(v)),
    [checkedDays],
  );

  const toggleDay = (value: number) => {
    setCheckedDays((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  // 총 회차 기본값: 주 N회 × 수업 기간(개월) × 4주. 관리자가 직접 값을 고치면 그 뒤로는
  // 자동계산이 값을 덮어쓰지 않는다.
  useEffect(() => {
    if (sessionsDirty) return;
    if (checkedDays.length === 0) {
      setTotalSessions("");
      return;
    }
    setTotalSessions(String(checkedDays.length * packageMonths * WEEKS_PER_MONTH));
  }, [checkedDays.length, packageMonths, sessionsDirty]);

  const computedEndDate = useMemo(
    () => computeEndDate(startDate, checkedDays, Number(totalSessions) || 0),
    [startDate, checkedDays, totalSessions],
  );

  // "모두 동일" 모드에서는 기본 시각 하나만 있으면 되고, "요일마다 다르게" 모드에서는
  // 체크된 요일 전부가 각자 시각을 가지고 있어야 강사를 찾을 수 있다.
  const canSearchTeachers =
    checkedDays.length > 0 &&
    (sameTimeForAllDays ? baseClassTime !== "" : checkedDays.every((v) => Boolean(dayTimes[v])));

  // 요일·시간(기본 또는 요일별 재설정)이 바뀔 때마다 별도 "찾아보기" 클릭 없이 자동으로
  // 그 조건에 가능한 강사만 다시 조회한다.
  useEffect(() => {
    if (!canSearchTeachers) {
      setAvailableTeachers(null);
      return;
    }
    const durationOverrides = sameTimeForAllDays ? {} : Object.fromEntries(Object.entries(dayTimes).filter(([, v]) => v));
    let cancelled = false;
    startSearch(async () => {
      const result = await findAvailableTeachersForSchedule({
        weekdayValues: checkedDays,
        classTime: sameTimeForAllDays ? baseClassTime : "",
        classTimes: durationOverrides,
        classDurationMin,
        excludeEnrollmentId: isEdit ? enrollmentId : undefined,
      });
      if (cancelled) return;
      setAvailableTeachers(result);
      setTeacherId((prev) => (result.some((t) => String(t.id) === prev) ? prev : ""));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedDays, baseClassTime, dayTimes, sameTimeForAllDays, classDurationMin, canSearchTeachers, isEdit, enrollmentId]);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {lockStudent && !isEdit && <input type="hidden" name="returnTo" value="/students?notice=enrollment-created" />}
      <Field label="학생">
        {lockStudent ? (
          <>
            <input value={studentLabel ?? ""} disabled className="input bg-slate-50 text-slate-500" />
            <input type="hidden" name="studentId" value={defaultStudentId ?? ""} />
          </>
        ) : (
          <select
            name="studentId"
            required
            defaultValue={defaultStudentId ?? ""}
            className="input"
            onChange={(e) => {
              const picked = students.find((s) => s.id === Number(e.target.value));
              setCurrentEnglishNameDefault(picked?.englishName ?? null);
              if (!englishNameDirty) {
                setEnglishName(picked?.englishName ?? romanizeKoreanName(picked?.name ?? "") ?? "");
              }
            }}
          >
            <option value="" disabled>
              선택하세요
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="영어 이름">
        <input
          name="studentEnglishName"
          value={englishName}
          onChange={(e) => {
            setEnglishName(e.target.value);
            setEnglishNameDirty(true);
          }}
          placeholder="예: Minjun Kim"
          className="input"
        />
        <p className="mt-1 text-xs text-slate-400">
          {currentEnglishNameDefault
            ? "학생 프로필의 영어 이름을 기본값으로 채웠습니다. 이 수강 건만 다르게 표기하려면 수정하세요."
            : "학생이 영어 이름을 등록하지 않아 이름 발음으로 초안을 채웠습니다 — 스펠링을 확인·수정해주세요."}
        </p>
      </Field>

      <Field label="수업 방법">
        <div className="flex flex-wrap gap-4">
          {CLASS_METHOD_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="radio"
                name="classMethod"
                value={o.value}
                defaultChecked={o.value === (initialValues?.classMethod ?? defaultClassMethod ?? "zoom")}
              />
              {o.label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="수준 (선택)">
        <select name="studentLevel" defaultValue={initialValues?.studentLevel ?? ""} className="input">
          <option value="">Select</option>
          {STUDENT_LEVEL_OPTIONS.map((lv) => (
            <option key={lv} value={lv}>
              레벨 {lv}
            </option>
          ))}
        </select>
      </Field>

      <Field label="교재 (선택)">
        <select name="textbookName" defaultValue={initialValues?.textbookName ?? ""} className="input">
          <option value="">Select</option>
          {TEXTBOOK_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <Field label="커리큘럼 (선택)">
        <input
          name="curriculum"
          defaultValue={initialValues?.curriculum ?? ""}
          placeholder="예: Basic Conversation Track"
          className="input"
        />
      </Field>

      <Field label="수업 종류">
        <p className="input flex items-center bg-slate-50 text-slate-500">
          {checkedDays.length > 0 ? `주 ${checkedDays.length}회` : "요일을 선택하면 자동으로 계산됩니다"}
        </p>
      </Field>

      <Field label="수업 요일">
        <div className="flex flex-wrap gap-3">
          {ORDERED_WEEKDAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1 text-sm text-slate-600">
              <input
                type="checkbox"
                name="scheduleDays"
                value={d.value}
                checked={checkedDays.includes(d.value)}
                onChange={() => toggleDay(d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="시간 선택">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="radio"
              name="classDurationMin"
              value="25"
              checked={classDurationMin === 25}
              onChange={() => setClassDurationMin(25)}
            />
            25분
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input
              type="radio"
              name="classDurationMin"
              value="50"
              checked={classDurationMin === 50}
              onChange={() => setClassDurationMin(50)}
            />
            50분
          </label>
        </div>
      </Field>

      <Field label="수업 기간">
        <div className="grid grid-cols-4 gap-x-2 gap-y-1.5">
          {PACKAGE_MONTHS_OPTIONS.map((m) => (
            <label key={m} className="flex items-center gap-1 text-sm text-slate-700">
              <input
                type="radio"
                name="packageMonths"
                value={m}
                checked={packageMonths === m}
                onChange={() => setPackageMonths(m)}
              />
              {m}개월
            </label>
          ))}
        </div>
      </Field>

      <Field label="총 회차">
        <input
          name="totalSessions"
          type="number"
          min={1}
          required
          value={totalSessions}
          onChange={(e) => {
            setTotalSessions(e.target.value);
            setSessionsDirty(true);
          }}
          className="input"
        />
        <p className="mt-1 text-xs text-slate-400">기본값 = 주 회차 × 수업 기간(4주 기준). 직접 수정할 수 있습니다.</p>
      </Field>

      <Field label="원하는 강의 시작일">
        <input name="startDate" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
      </Field>

      <Field label="강의 시간 선택">
        <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <input
            type="checkbox"
            checked={sameTimeForAllDays}
            onChange={(e) => {
              const checked = e.target.checked;
              setSameTimeForAllDays(checked);
              if (checked) setDayTimes({});
            }}
          />
          모두 동일한 시간 선택
        </label>

        {sameTimeForAllDays ? (
          <select name="classTime" value={baseClassTime} onChange={(e) => setBaseClassTime(e.target.value)} className="input">
            <option value="">선택하세요</option>
            {HALF_HOUR_TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : orderedCheckedDays.length === 0 ? (
          <p className="input flex items-center bg-slate-50 text-slate-400">수업 요일을 먼저 선택하세요</p>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            {orderedCheckedDays.map((v) => {
              const day = WEEKDAYS.find((d) => d.value === v)!;
              return (
                <div key={v} className="flex items-center gap-2 text-sm">
                  <span className="w-6 shrink-0 font-medium text-slate-600">{day.label}</span>
                  <select
                    name={`dayTime_${v}`}
                    required
                    value={dayTimes[v] ?? ""}
                    onChange={(e) => setDayTimes((prev) => ({ ...prev, [v]: e.target.value }))}
                    className="input"
                  >
                    <option value="">선택하세요</option>
                    {HALF_HOUR_TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-1 text-xs text-slate-400">
          {sameTimeForAllDays
            ? "체크를 해제하면 요일마다 다른 시각을 각각 지정할 수 있습니다."
            : "요일마다 다른 시각을 지정합니다. 다시 체크하면 모든 요일에 같은 시각이 적용됩니다."}
        </p>
      </Field>

      <Field label="수강 종료일">
        <p className="input flex items-center bg-slate-50 text-slate-500">
          {computedEndDate ?? "시작일·요일·총 회차를 입력하면 자동으로 계산됩니다"}
        </p>
        <input type="hidden" name="endDate" value={computedEndDate ?? ""} />
      </Field>

      <Field label="강사 (해당 요일·시간에 가능한 강사만)">
        <select
          name="teacherId"
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          disabled={canSearchTeachers && searchPending}
          className="input"
        >
          {!canSearchTeachers ? (
            <option value="">수업 요일·시간을 먼저 선택하세요</option>
          ) : searchPending ? (
            <option value="">조회 중...</option>
          ) : (
            <>
              <option value="">미배정</option>
              {(availableTeachers ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </>
          )}
        </select>
      </Field>

      <Field label="관리자 메모 (선택)">
        <textarea name="adminNote" defaultValue={initialValues?.adminNote ?? ""} rows={3} className="input" />
      </Field>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? (isEdit ? "저장 중..." : "등록 중...") : isEdit ? "저장" : "등록"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
