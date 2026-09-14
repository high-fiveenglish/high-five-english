"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  updateLevelTest,
  confirmLevelTestSchedule,
  revertLevelTestConfirmation,
  setLevelTestOutcome,
  reopenLevelTestConfirmation,
} from "../actions";
import { TERMINAL_PROGRESS_STATUSES } from "@/lib/levelTestOptions";
import { ImpersonateButton } from "../../students/ImpersonateButton";
import { useLevelTestAvailableTeachers } from "../useLevelTestAvailableTeachers";
import { formatAppDate, formatAppTime, formatAppDateTime } from "@/lib/appTime";
import {
  CLASS_METHOD_OPTIONS,
  ENGLISH_LEVEL_OPTIONS,
  AGE_GROUP_OPTIONS,
  AGE_GROUP_TO_TOPIC_GROUP,
  ALL_INTEREST_TOPIC_OPTIONS,
  INTEREST_TOPIC_GROUPS,
} from "@/lib/levelTestOptions";
import { HALF_HOUR_TIME_OPTIONS } from "@/lib/timeOptions";

export type LevelTestDetail = {
  id: number;
  isLead: boolean;
  studentId: number | null;
  loginId: string | null;
  name: string;
  englishName: string | null;
  appliedAt: string;
  // 신청 시 학생이 고른 희망 레벨테스트 일시. 확정 전에는 "찾아보기"의 기본 검색
  // 날짜로만 쓰이고, 확정 버튼을 눌러야 비로소 실제 담당강사·수업일자·진행상태에
  // 반영된다.
  scheduledTestDate: string | null;
  mobilePhone: string;
  email: string;
  teamsId: string;
  kakaoId: string;
  wechatId: string;
  classMethod: string;
  englishLevel: string;
  ageGroup: string;
  interestTopic: string;
  teacherNote: string;
  adminNote: string;
  resultContent: string;
  recommendedLevel: string;
  recommendedTextbook: string;
  scoreListening: number | null;
  scoreSpeakingFluency: number | null;
  scoreSpeakingGrammar: number | null;
  scoreVocabulary: number | null;
  scoreCompletion: number | null;
  progressStatus: string;
  teacherId: number | null;
  teacherName: string | null;
};

export function LevelTestEditForm({ levelTest: lt }: { levelTest: LevelTestDetail }) {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="mb-1 flex items-center justify-between">
        <Link href="/level-tests" className="text-xs font-semibold text-slate-500 hover:underline">
          ← 레벨테스트관리로
        </Link>
        {lt.studentId && <ImpersonateButton studentId={lt.studentId} studentName={lt.name} />}
      </div>

      <GeneralInfoForm lt={lt} />
      <ScheduleConfirmSection lt={lt} />
    </div>
  );
}

// 신청 당시 정보 + 관리자가 자유롭게 고칠 수 있는 항목 — 담당강사/일시/진행상태는
// 여기 없다(ScheduleConfirmSection의 몫). "저장"은 이 항목들만 반영한다.
function GeneralInfoForm({ lt }: { lt: LevelTestDetail }) {
  const action = updateLevelTest.bind(null, lt.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [ageGroup, setAgeGroup] = useState(lt.ageGroup);
  const [interestTopic, setInterestTopic] = useState(lt.interestTopic);
  const topicGroupKey = AGE_GROUP_TO_TOPIC_GROUP[ageGroup];
  const topicOptions = topicGroupKey ? INTEREST_TOPIC_GROUPS[topicGroupKey] : ALL_INTEREST_TOPIC_OPTIONS;

  const [scoreListening, setScoreListening] = useState(lt.scoreListening);
  const [scoreSpeakingFluency, setScoreSpeakingFluency] = useState(lt.scoreSpeakingFluency);
  const [scoreSpeakingGrammar, setScoreSpeakingGrammar] = useState(lt.scoreSpeakingGrammar);
  const [scoreVocabulary, setScoreVocabulary] = useState(lt.scoreVocabulary);
  // 완성도/이해도는 나머지 네 영역의 평균을 자동 계산한다 — 강사용 결과 작성 화면과
  // 동일한 규칙(강사 쪽만 자동이고 관리자는 수동이면 두 화면 결과가 서로 어긋난다).
  const scoreCompletion = useMemo(() => {
    const scores = [scoreListening, scoreSpeakingFluency, scoreSpeakingGrammar, scoreVocabulary];
    if (scores.some((s) => s == null)) return null;
    const sum = scores.reduce<number>((acc, s) => acc + s!, 0);
    return Math.round(sum / scores.length);
  }, [scoreListening, scoreSpeakingFluency, scoreSpeakingGrammar, scoreVocabulary]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Section title="신청자 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label={lt.isLead ? "구분" : "아이디"}>
            <input
              value={lt.isLead ? "리드(비회원) 신청" : (lt.loginId ?? "-")}
              disabled
              className="input bg-slate-50 text-slate-400"
            />
          </Field>
          <Field label="이름">
            <input value={lt.name} disabled className="input bg-slate-50 text-slate-400" />
          </Field>
          <Field label="영어이름">
            <input value={lt.englishName ?? "-"} disabled className="input bg-slate-50 text-slate-400" />
          </Field>
          <Field label="신청일자">
            <input value={formatAppDateTime(new Date(lt.appliedAt))} disabled className="input bg-slate-50 text-slate-400" />
          </Field>
        </div>
      </Section>

      <Section title="연락처">
        <div className="grid grid-cols-2 gap-4">
          <Field label="휴대전화번호">
            <input name="mobilePhone" defaultValue={lt.mobilePhone} placeholder="010 - 0000 - 0000" className="input" />
          </Field>
          <Field label="이메일">
            <input name="email" type="email" defaultValue={lt.email} className="input" />
          </Field>
          <Field label="팀즈 ID">
            <input name="teamsId" defaultValue={lt.teamsId} className="input" />
          </Field>
          <Field label="카카오톡 ID">
            <input name="kakaoId" defaultValue={lt.kakaoId} className="input" />
          </Field>
          <Field label="위챗 ID">
            <input name="wechatId" defaultValue={lt.wechatId} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="수업방법">
        <RadioGroup name="classMethod" options={CLASS_METHOD_OPTIONS} defaultValue={lt.classMethod || "zoom"} />
      </Section>

      <Section title="영어실력">
        <RadioGroup name="englishLevel" options={ENGLISH_LEVEL_OPTIONS} defaultValue={lt.englishLevel || "beginner"} stacked />
      </Section>

      <Section title="연령대">
        <select
          name="ageGroup"
          value={ageGroup}
          onChange={(e) => {
            setAgeGroup(e.target.value);
            setInterestTopic("");
          }}
          className="input max-w-xs"
        >
          <option value="">:: 선택 ::</option>
          {AGE_GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Section>

      <Section title="레벨테스트 문제 (관심분야)">
        <select
          name="interestTopic"
          value={interestTopic}
          onChange={(e) => setInterestTopic(e.target.value)}
          className="input max-w-xs"
        >
          <option value="">:: 레벨테스트 문제 ::</option>
          {topicOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Section>

      <Section title="강사에게 전달할 사항 / 관리자 노트">
        <Field label="강사에게 전달할 사항">
          <textarea
            name="teacherNote"
            defaultValue={lt.teacherNote}
            rows={3}
            placeholder="학생 성향, 수업 요청사항, 학부모 요청사항, 테스트 시 특별히 확인할 사항 등"
            className="input"
          />
        </Field>
        <Field label="관리자 노트">
          <textarea
            name="adminNote"
            defaultValue={lt.adminNote}
            rows={3}
            placeholder="관리자끼리만 보는 내부 메모"
            className="input"
          />
        </Field>
      </Section>

      <Section title="레벨테스트 결과(평가서)" id="result">
        <div className="grid grid-cols-2 gap-4">
          <Field label="추천 레벨 (예: Lv3)">
            <input name="recommendedLevel" defaultValue={lt.recommendedLevel} placeholder="Lv3" className="input" />
          </Field>
          <Field label="추천 교재">
            <input
              name="recommendedTextbook"
              defaultValue={lt.recommendedTextbook}
              placeholder="OXFORD DISCOVER 2, 2ND EDITION"
              className="input"
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-600">영역별 평가 (1~5점)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <ScoreSelect name="scoreListening" label="듣기" value={scoreListening} onChange={setScoreListening} />
            <ScoreSelect
              name="scoreSpeakingFluency"
              label="말하기 유창성"
              value={scoreSpeakingFluency}
              onChange={setScoreSpeakingFluency}
            />
            <ScoreSelect
              name="scoreSpeakingGrammar"
              label="말하기 문법"
              value={scoreSpeakingGrammar}
              onChange={setScoreSpeakingGrammar}
            />
            <ScoreSelect name="scoreVocabulary" label="단어" value={scoreVocabulary} onChange={setScoreVocabulary} />
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-slate-600">완성도/이해도 (자동)</span>
              <div className="input flex items-center bg-slate-50 text-slate-500">{scoreCompletion ?? "-"}</div>
            </div>
          </div>
        </div>

        <Field label="테스트 결과 내용">
          <textarea
            name="resultContent"
            defaultValue={lt.resultContent}
            rows={6}
            placeholder="레벨테스트 진행 결과, 학생의 실력 평가, 추천 레벨 등을 정리해서 적어주세요."
            className="input"
          />
        </Field>
      </Section>

      {state?.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{state.error}</p>}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}

// 담당강사·레벨테스트 일시·진행상태(수업확정) — 이 셋은 개별 선택값이 아니라
// "확정한다"는 하나의 행위로만 정해진다. 확정 전에는 편집 폼을, 확정 후에는 결과
// 표시 + 결과 처리 버튼(수업완료/결석/취소)을 보여준다.
function ScheduleConfirmSection({ lt }: { lt: LevelTestDetail }) {
  if (lt.progressStatus === "수업확정") {
    return <ConfirmedView lt={lt} />;
  }
  if ((TERMINAL_PROGRESS_STATUSES as readonly string[]).includes(lt.progressStatus)) {
    return <FinishedView lt={lt} />;
  }
  return <ConfirmForm lt={lt} />;
}

function ConfirmForm({ lt }: { lt: LevelTestDetail }) {
  const action = confirmLevelTestSchedule.bind(null, lt.id);
  const [state, formAction, pending] = useActionState(action, undefined);

  const requestedDate = lt.scheduledTestDate ? new Date(lt.scheduledTestDate) : null;
  const [testDate, setTestDate] = useState(requestedDate ? formatAppDate(requestedDate) : "");
  const [teacherId, setTeacherId] = useState(lt.teacherId ? String(lt.teacherId) : "");
  const [testTime, setTestTime] = useState(requestedDate ? formatAppTime(requestedDate) : "");
  const { teachers: availableTeachers, loading: loadingTeachers, canSearch } = useLevelTestAvailableTeachers({
    testDate,
    testTime,
    excludeLevelTestId: lt.id,
    setTeacherId,
    initialTeacher: lt.teacherId && lt.teacherName ? { id: lt.teacherId, label: lt.teacherName } : null,
  });

  return (
    <form action={formAction}>
      <Section title="레벨테스트 일시 및 강사 확정">
        <p className="text-xs text-slate-400">
          날짜는 학생이 신청 시 희망한 일시로 미리 채워져 있습니다. 필요하면 바꾸고, 담당 강사를 고른 뒤 "수업
          확정"을 눌러야 실제로 반영됩니다 — 담당강사·수업일자·진행상태는 이 확정 하나로 함께 정해집니다.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="날짜">
            <input
              name="testDate"
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="시간">
            <select name="testTime" value={testTime} onChange={(e) => setTestTime(e.target.value)} className="input">
              <option value="">선택하세요</option>
              {HALF_HOUR_TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="담당 강사 (해당 일시에 가능한 강사만)">
          <select
            name="teacherId"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            disabled={canSearch && loadingTeachers}
            className="input"
          >
            {!canSearch ? (
              <option value="">날짜·시간을 먼저 선택하세요</option>
            ) : loadingTeachers ? (
              <option value="">조회 중...</option>
            ) : (
              <>
                <option value="">미지정</option>
                {availableTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>

        {state?.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{state.error}</p>}

        <div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "확정 중..." : "수업 확정"}
          </button>
        </div>
      </Section>
    </form>
  );
}

function ConfirmedView({ lt }: { lt: LevelTestDetail }) {
  const [pending, startTransition] = useTransition();
  const confirmedDate = lt.scheduledTestDate ? formatAppDateTime(new Date(lt.scheduledTestDate)) : "-";

  return (
    <Section title="레벨테스트 일시 및 강사 (확정됨)">
      <div className="grid grid-cols-2 gap-4">
        <Field label="담당 강사">
          <input value={lt.teacherName ?? "-"} disabled className="input bg-slate-50 text-slate-400" />
        </Field>
        <Field label="확정된 일시">
          <input value={confirmedDate} disabled className="input bg-slate-50 text-slate-400" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setLevelTestOutcome(lt.id, "수업완료"))}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          수업완료 처리
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setLevelTestOutcome(lt.id, "결석"))}
          className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          결석 처리
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setLevelTestOutcome(lt.id, "취소"))}
          className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          취소 처리
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("확정을 취소하고 접수 상태로 되돌립니다. 담당 강사 배정도 함께 풀립니다.")) return;
            startTransition(() => revertLevelTestConfirmation(lt.id));
          }}
          className="ml-auto text-xs font-medium text-slate-400 hover:text-slate-600 hover:underline disabled:opacity-50"
        >
          확정 취소(되돌리기)
        </button>
      </div>
    </Section>
  );
}

// 수업완료/결석/취소로 끝난 건 — 다시 자유롭게 편집하는 폼을 보여주지 않고 결과만
// 보여준다("확정" 화면이 매번 다시 뜨면 실수로 강사·일시를 새로 확정해버릴 수 있다).
// 잘못 처리했다면 "수업확정으로 되돌리기"로만 되돌아간다(강사·일시는 그대로 유지).
function FinishedView({ lt }: { lt: LevelTestDetail }) {
  const [pending, startTransition] = useTransition();
  const confirmedDate = lt.scheduledTestDate ? formatAppDateTime(new Date(lt.scheduledTestDate)) : "-";

  return (
    <Section title={`레벨테스트 일시 및 강사 (${lt.progressStatus})`}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="담당 강사">
          <input value={lt.teacherName ?? "-"} disabled className="input bg-slate-50 text-slate-400" />
        </Field>
        <Field label="확정했던 일시">
          <input value={confirmedDate} disabled className="input bg-slate-50 text-slate-400" />
        </Field>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => reopenLevelTestConfirmation(lt.id))}
        className="w-fit text-xs font-medium text-slate-400 hover:text-slate-600 hover:underline disabled:opacity-50"
      >
        수업확정으로 되돌리기
      </button>
    </Section>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="flex scroll-mt-6 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {children}
    </div>
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

function ScoreSelect({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <select
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="input"
      >
        <option value="">-</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

function RadioGroup({
  name,
  options,
  defaultValue,
  stacked,
}: {
  name: string;
  options: readonly { value: string; label: string }[];
  defaultValue: string;
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? "flex flex-col gap-2" : "flex flex-wrap gap-4"}>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-1.5 text-sm text-slate-700">
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} />
          {o.label}
        </label>
      ))}
    </div>
  );
}
