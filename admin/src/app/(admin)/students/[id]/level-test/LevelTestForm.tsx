"use client";

import { useActionState, useRef, useState } from "react";
import { createLevelTestForStudent } from "./actions";
import { TeacherAvailabilityPicker } from "./TeacherAvailabilityPicker";
import {
  SUBJECT_OPTIONS,
  CLASS_METHOD_OPTIONS,
  ENGLISH_LEVEL_OPTIONS,
  AGE_GROUP_OPTIONS,
  INTEREST_TOPIC_OPTIONS,
} from "@/lib/levelTestOptions";

export type StudentDefaults = {
  id: number;
  loginId: string;
  name: string;
  landlinePhone: string | null;
  mobilePhone: string | null;
  email: string | null;
  teamsId: string | null;
  kakaoId: string | null;
  preferredClassMethod: string | null;
};

export type TeacherOption = { id: number; label: string };

export function LevelTestForm({
  student,
  teachers,
  defaultEnglishLevel,
  defaultAgeGroup,
  defaultInterestTopic,
}: {
  student: StudentDefaults;
  teachers: TeacherOption[];
  defaultEnglishLevel: string | null;
  defaultAgeGroup: string | null;
  defaultInterestTopic: string | null;
}) {
  const action = createLevelTestForStudent.bind(null, student.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const dateRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const [teacherId, setTeacherId] = useState("");

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <Section title="과목">
        <RadioGroup name="subject" options={SUBJECT_OPTIONS} defaultValue="online_english" />
      </Section>

      <Section title="학생 정보">
        <Field label="아이디 (이름)">
          <input
            value={`${student.loginId} (${student.name})`}
            disabled
            className="input bg-slate-50 text-slate-500"
          />
        </Field>
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
            <input ref={dateRef} name="testDate" type="date" className="input" />
          </Field>
          <Field label="희망 시작시간">
            <input ref={timeRef} name="testTime" type="time" className="input" />
          </Field>
        </div>
        <div className="flex items-end gap-3">
          <Field label="희망 강사">
            <select
              name="teacherId"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="input"
            >
              <option value="">미지정</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <TeacherAvailabilityPicker
            getDate={() => dateRef.current?.value ?? ""}
            onPick={(id, _name, hour) => {
              setTeacherId(String(id));
              if (timeRef.current) timeRef.current.value = `${String(hour).padStart(2, "0")}:00`;
            }}
          />
        </div>
        <p className="text-xs text-slate-400">
          &ldquo;찾아보기&rdquo;를 누르면 선택한 수업일자 기준으로 실제 비어있는 강사·시간만 보여줍니다.
        </p>
      </Section>

      <Section title="영어실력">
        <RadioGroup
          name="englishLevel"
          options={ENGLISH_LEVEL_OPTIONS}
          defaultValue={defaultEnglishLevel ?? "beginner"}
          stacked
        />
      </Section>

      <Section title="연령대">
        <select name="ageGroup" defaultValue={defaultAgeGroup ?? ""} className="input max-w-xs">
          <option value="">:: 선택 ::</option>
          {AGE_GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Section>

      <Section title="레벨테스트 문제 (관심분야)">
        <select name="interestTopic" defaultValue={defaultInterestTopic ?? ""} className="input max-w-xs">
          <option value="">:: 레벨테스트 문제 ::</option>
          {INTEREST_TOPIC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Section>

      <Section title="강사에게 전달할 사항">
        <textarea
          name="teacherNote"
          rows={4}
          placeholder="학생 성향, 수업 요청사항, 학부모 요청사항, 테스트 시 특별히 확인할 사항 등"
          className="input"
        />
      </Section>

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "신청 중..." : "레벨테스트 신청"}
      </button>
    </form>
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
