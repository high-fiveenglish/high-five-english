"use client";

import { useActionState } from "react";
import { updateTeacher } from "../actions";
import { FileToBase64Field } from "../FileToBase64Field";
import { AVAILABLE_TIME_SLOT_MINUTES, formatMinuteOfDay } from "@/lib/timeSlots";

// 강사 단가는 필리핀 강사 기준 페소(₱)로 관리한다 — 원화가 아니다. 소수점은 있는
// 경우에만 최대 2자리까지 보여주고 불필요한 0은 자른다(예: 100 → ₱100, 100.5 → ₱100.5).
function formatPeso(value: number): string {
  return `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
}

export type TeacherEditValues = {
  id: number;
  realName: string;
  nickname: string | null;
  loginId: string;
  nationality: string | null;
  email: string | null;
  approvalStatus: string;
  currentRate: string | null;
  teacherGrade: string;
  teamLeaderId: number | null;
  sex: string | null;
  age: number | null;
  schoolName: string | null;
  major: string | null;
  address: string | null;
  availableHours: number[];
  mobilePhone: string | null;
  teamsId: string | null;
  teamsUrl: string | null;
  zoomUrl: string | null;
  zoomPw: string | null;
  tencentUrl: string | null;
  experience: string | null;
  selfIntroduction: string | null;
  photoUrl: string | null;
  voiceUrl: string | null;
  videoYoutubeCode: string | null;
  tesol: boolean;
  priority: number;
};

export function TeacherEditForm({
  teacher,
  teamLeaderOptions,
}: {
  teacher: TeacherEditValues;
  teamLeaderOptions: { id: number; label: string }[];
}) {
  const action = updateTeacher.bind(null, teacher.id);
  const [state, formAction, pending] = useActionState(action, undefined);
  const t = teacher;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      <Section title="기본 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label="로그인 ID (변경 불가)">
            <input value={t.loginId} disabled className="input bg-slate-50 text-slate-400" />
          </Field>
          <Field label="실명">
            <input name="realName" defaultValue={t.realName} required className="input" />
          </Field>
          <Field label="닉네임 (선택)">
            <input name="nickname" defaultValue={t.nickname ?? ""} className="input" />
          </Field>
          <Field label="강사 등급">
            <select name="teacherGrade" defaultValue={t.teacherGrade} className="input">
              <option value="GENERAL">일반강사</option>
              <option value="SENIOR">수석강사</option>
            </select>
          </Field>
          <Field label="팀 리더 (선택)">
            <select name="teamLeaderId" defaultValue={t.teamLeaderId ?? ""} className="input">
              <option value="">없음</option>
              {teamLeaderOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="국적 (선택)">
            <input name="nationality" defaultValue={t.nationality ?? ""} className="input" />
          </Field>
          <Field label="승인 상태">
            <select name="approvalStatus" defaultValue={t.approvalStatus} className="input">
              <option value="PENDING">승인 대기</option>
              <option value="APPROVED">승인됨</option>
              <option value="REJECTED">반려</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="신상 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label="성별 (선택)">
            <select name="sex" defaultValue={t.sex ?? ""} className="input">
              <option value="">선택 안 함</option>
              <option value="MALE">남</option>
              <option value="FEMALE">여</option>
            </select>
          </Field>
          <Field label="나이 (선택)">
            <input name="age" type="number" min={0} defaultValue={t.age ?? ""} className="input" />
          </Field>
          <Field label="학교 (선택)">
            <input name="schoolName" defaultValue={t.schoolName ?? ""} className="input" />
          </Field>
          <Field label="전공 (선택)">
            <input name="major" defaultValue={t.major ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="연락처">
        <div className="grid grid-cols-2 gap-4">
          <Field label="이메일 (선택)">
            <input name="email" type="email" defaultValue={t.email ?? ""} className="input" />
          </Field>
          <Field label="휴대폰 번호 (선택)">
            <input name="mobilePhone" defaultValue={t.mobilePhone ?? ""} className="input" />
          </Field>
        </div>
        <Field label="주소 (선택)">
          <input name="address" defaultValue={t.address ?? ""} className="input" />
        </Field>
      </Section>

      <Section title="화상 미팅 접속 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Teams ID (선택)">
            <input name="teamsId" defaultValue={t.teamsId ?? ""} className="input" />
          </Field>
          <Field label="Teams URL (선택)">
            <input name="teamsUrl" defaultValue={t.teamsUrl ?? ""} className="input" />
          </Field>
          <Field label="Tencent URL (선택)">
            <input name="tencentUrl" defaultValue={t.tencentUrl ?? ""} className="input" />
          </Field>
          <Field label="Zoom URL (선택)">
            <input name="zoomUrl" defaultValue={t.zoomUrl ?? ""} className="input" />
          </Field>
          <Field label="Zoom PW (선택)">
            <input name="zoomPw" defaultValue={t.zoomPw ?? ""} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="소개">
        <Field label="경력 (선택)">
          <textarea name="experience" defaultValue={t.experience ?? ""} rows={3} className="input" />
        </Field>
        <Field label="자기소개 (선택)">
          <textarea name="selfIntroduction" defaultValue={t.selfIntroduction ?? ""} rows={3} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="소개 영상 유튜브 코드 (선택)">
            <input name="videoYoutubeCode" defaultValue={t.videoYoutubeCode ?? ""} className="input" />
          </Field>
          <label className="mt-6 flex items-center gap-2 text-sm font-medium text-slate-600">
            <input type="checkbox" name="tesol" defaultChecked={t.tesol} />
            TESOL 자격 보유
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FileToBase64Field
            name="photoUrl"
            accept="image/*"
            label="사진 (내부 참고용)"
            defaultValue={t.photoUrl}
            previewKind="image"
          />
          <FileToBase64Field
            name="voiceUrl"
            accept="audio/*"
            label="음성 (내부 참고용)"
            defaultValue={t.voiceUrl}
            previewKind="audio"
          />
        </div>
      </Section>

      <Section title="근무 가능 시간">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-600">
            시간대별 근무 가능 (기준시 기준, 오전 6시~밤 12시, 30분 단위)
          </span>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {AVAILABLE_TIME_SLOT_MINUTES.map((m) => (
              <label key={m} className="flex items-center gap-1 rounded-lg border border-slate-200 px-1.5 py-1 text-xs text-slate-600">
                <input type="checkbox" name="availableHours" value={m} defaultChecked={t.availableHours.includes(m)} />
                {formatMinuteOfDay(m)}~{formatMinuteOfDay(m + 30)}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="운영 정보">
        <div className="grid grid-cols-2 gap-4">
          <Field label="우선순위 (숫자가 높을수록 목록 상위)">
            <input name="priority" type="number" defaultValue={t.priority} className="input" />
          </Field>
          <Field
            label={`현재 단가(25분): ${t.currentRate ? formatPeso(Number(t.currentRate)) : "미설정"} — 변경 시 새 이력으로 추가`}
          >
            <input name="newRatePerUnit" type="number" min={0} placeholder="변경 시에만 입력" className="input" />
          </Field>
        </div>

        {t.currentRate && (
          <div className="grid grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">수업 출석 (25분)</p>
              <p className="font-semibold text-slate-900">{formatPeso(Number(t.currentRate))}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">학생 결석 (출석의 50% 지급)</p>
              <p className="font-semibold text-slate-900">{formatPeso(Number(t.currentRate) * 0.5)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">유급휴가 (25분 기본급 × 8)</p>
              <p className="font-semibold text-slate-900">{formatPeso(Number(t.currentRate) * 8)}</p>
            </div>
          </div>
        )}

        <Field label="비밀번호 재설정 (선택)">
          <input name="newPassword" type="password" placeholder="변경 시에만 입력" className="input" />
        </Field>
      </Section>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : "저장"}
      </button>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
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
