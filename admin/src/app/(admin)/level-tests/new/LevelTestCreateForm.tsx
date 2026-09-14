"use client";

import { useActionState, useState } from "react";
import { createLevelTest } from "../actions";
import { useLevelTestAvailableTeachers } from "../useLevelTestAvailableTeachers";
import {
  SUBJECT_OPTIONS,
  CLASS_METHOD_OPTIONS,
  ENGLISH_LEVEL_OPTIONS,
  AGE_GROUP_OPTIONS,
  AGE_GROUP_TO_TOPIC_GROUP,
  ALL_INTEREST_TOPIC_OPTIONS,
  INTEREST_TOPIC_GROUPS,
} from "@/lib/levelTestOptions";
import { HALF_HOUR_TIME_OPTIONS } from "@/lib/timeOptions";

export type StudentOption = {
  id: number;
  label: string;
  landlinePhone: string | null;
  mobilePhone: string | null;
  email: string | null;
  teamsId: string | null;
  kakaoId: string | null;
  wechatId: string | null;
  preferredClassMethod: string | null;
};

export function LevelTestCreateForm({
  students,
  defaultStudentId,
}: {
  students: StudentOption[];
  defaultStudentId: number | null;
}) {
  const [state, formAction, pending] = useActionState(createLevelTest, undefined);
  const [studentId, setStudentId] = useState(defaultStudentId ? String(defaultStudentId) : "");
  const selectedStudent = students.find((s) => s.id === Number(studentId)) ?? null;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <Section title="학생">
        <select
          name="studentId"
          required
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="input"
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
      </Section>

      <Section title="과목">
        <RadioGroup name="subject" options={SUBJECT_OPTIONS} defaultValue="online_english" />
      </Section>

      {/* 학생을 바꾸면 연락처/수업방법 기본값이 그 학생 것으로 다시 채워져야 하므로,
          key={studentId}로 이 서브트리를 통째로 새로 마운트한다(각 입력을 일일이
          동기화하는 것보다 훨씬 단순하고 확실하다). */}
      {selectedStudent && <StudentDependentFields key={selectedStudent.id} student={selectedStudent} />}

      {state?.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || !studentId}
        className="w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "등록 중..." : "레벨테스트 신청 등록"}
      </button>
    </form>
  );
}

function StudentDependentFields({ student }: { student: StudentOption }) {
  const [testDate, setTestDate] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [testTime, setTestTime] = useState("");
  const { teachers: availableTeachers, loading: loadingTeachers, canSearch } = useLevelTestAvailableTeachers({
    testDate,
    testTime,
    setTeacherId,
  });
  const [ageGroup, setAgeGroup] = useState("");
  const [interestTopic, setInterestTopic] = useState("");
  const topicGroupKey = AGE_GROUP_TO_TOPIC_GROUP[ageGroup];
  const topicOptions = topicGroupKey ? INTEREST_TOPIC_GROUPS[topicGroupKey] : ALL_INTEREST_TOPIC_OPTIONS;

  return (
    <>
      <Section title="연락처">
        <div className="grid grid-cols-2 gap-4">
          <Field label="일반전화번호">
            <input
              name="landlinePhone"
              defaultValue={student.landlinePhone ?? ""}
              placeholder="000 - 0000 - 0000"
              className="input"
            />
          </Field>
          <Field label="휴대전화번호">
            <input
              name="mobilePhone"
              defaultValue={student.mobilePhone ?? ""}
              placeholder="010 - 0000 - 0000"
              className="input"
            />
          </Field>
          <Field label="이메일">
            <input name="email" type="email" defaultValue={student.email ?? ""} className="input" />
          </Field>
          <Field label="팀즈 ID">
            <input name="teamsId" defaultValue={student.teamsId ?? ""} className="input" />
          </Field>
          <Field label="카카오톡 ID">
            <input name="kakaoId" defaultValue={student.kakaoId ?? ""} className="input" />
          </Field>
          <Field label="위챗 ID">
            <input name="wechatId" defaultValue={student.wechatId ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="수업방법">
        <RadioGroup
          name="classMethod"
          options={CLASS_METHOD_OPTIONS}
          defaultValue={student.preferredClassMethod ?? "zoom"}
        />
      </Section>

      <Section title="희망 일시 및 강사">
        <div className="grid grid-cols-2 gap-4">
          <Field label="수업일자">
            <input
              name="testDate"
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="희망 시작시간">
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
        <Field label="희망 강사 (해당 일시에 가능한 강사만)">
          <select
            name="teacherId"
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            disabled={canSearch && loadingTeachers}
            className="input"
          >
            {!canSearch ? (
              <option value="">수업일자·시작시간을 먼저 선택하세요</option>
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
      </Section>

      <Section title="영어실력">
        <RadioGroup name="englishLevel" options={ENGLISH_LEVEL_OPTIONS} defaultValue="beginner" stacked />
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
        <p className="text-xs text-slate-400">연령대를 먼저 선택하면 해당 연령대에 맞는 주제만 표시됩니다.</p>
      </Section>

      <Section title="강사에게 전달할 사항">
        <textarea
          name="teacherNote"
          rows={4}
          placeholder="학생 성향, 수업 요청사항, 학부모 요청사항, 테스트 시 특별히 확인할 사항 등"
          className="input"
        />
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
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
