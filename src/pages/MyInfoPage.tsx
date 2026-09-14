import { useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { PlaceholderPage } from "./PlaceholderPage";
import { updateMyProfile, type StudentProfileSnapshot } from "../services/studentProfileService";

// "정보변경" 화면. 실제 admin DB 학생 계정 세션(직접 로그인했든, 관리자의 "회원으로
// 로그인"으로 들어왔든 — isRealAccount)에서만 진짜 폼을 보여준다. 마케팅 사이트를
// 벗어나 admin 자체 페이지로 이동시키던 예전 방식 대신, 이 화면 안에서 조회/저장까지
// 전부 처리한다("내 강의실"과 같은 느낌을 유지하기 위함) — 저장은 admin의 공개
// student-profile API(Bearer 토큰)를 직접 호출하고, admin의 같은 Student row를
// 그대로 고치므로 관리자 학생관리 화면에도 곧바로 반영된다. 프로필 값 자체는 로그인/
// SSO 응답에 이미 실려와 AuthContext.studentProfile에 저장돼 있으므로, 여기서 또
// 조회할 필요가 없다 — 다른 게시판들처럼 로딩 스피너 없이 즉시 렌더링된다. 데모
// 계정은 저장할 실제 DB 행이 없어 여전히 안내 placeholder만 보여준다.
const inputClass =
  "w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function MyInfoPage() {
  const { t } = useTranslation("common");
  const { role, isRealAccount, studentApiToken, studentProfile, setStudentProfile } = useAuth();

  if (role === "student" && isRealAccount && studentApiToken) {
    if (!studentProfile) {
      // 이론상 로그인 응답에 항상 같이 오지만(admin의 student-login/sso-verify가
      // 매번 채워줌), 혹시라도 없으면 재로그인을 안내한다 — 데모 계정 문구와는
      // 다른 케이스라 별도로 처리한다.
      return (
        <Container className="flex min-h-[50vh] items-center justify-center py-24 text-center">
          <p className="max-w-sm text-sm text-slate-500">프로필 정보를 불러오지 못했습니다. 다시 로그인해주세요.</p>
        </Container>
      );
    }
    return (
      <StudentProfileForm
        token={studentApiToken}
        initialSnapshot={studentProfile}
        onSaved={setStudentProfile}
      />
    );
  }

  const description = role === "student" ? t("errors.demo_account_no_profile") : undefined;
  return <PlaceholderPage title={t("topbar.my_info")} description={description} />;
}

type FormState = {
  englishName: string;
  sex: string;
  birthDate: string;
  occupation: string;
  region: string;
  address: string;
  mobilePhone: string;
  email: string;
  preferredClassMethod: string;
  teamsId: string;
  kakaoId: string;
  wechatId: string;
  newPassword: string;
  newPasswordConfirm: string;
};

function snapshotToForm(s: StudentProfileSnapshot): FormState {
  return {
    englishName: s.englishName ?? "",
    sex: s.sex ?? "",
    birthDate: s.birthDate ?? "",
    occupation: s.occupation ?? "",
    region: s.region ?? "",
    address: s.address ?? "",
    mobilePhone: s.mobilePhone ?? "",
    email: s.email ?? "",
    preferredClassMethod: s.preferredClassMethod ?? "",
    teamsId: s.teamsId ?? "",
    kakaoId: s.kakaoId ?? "",
    wechatId: s.wechatId ?? "",
    newPassword: "",
    newPasswordConfirm: "",
  };
}

function StudentProfileForm({
  token,
  initialSnapshot,
  onSaved,
}: {
  token: string;
  initialSnapshot: StudentProfileSnapshot;
  onSaved: (s: StudentProfileSnapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [form, setForm] = useState<FormState>(() => snapshotToForm(initialSnapshot));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set =
    (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const res = await updateMyProfile(token, form);
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error.message);
      return;
    }
    setSnapshot(res.value);
    setForm(snapshotToForm(res.value));
    onSaved(res.value);
    setSaved(true);
  }

  return (
    <Container className="max-w-2xl py-16">
      <SectionHeading
        align="left"
        eyebrow="마이페이지"
        title="정보변경"
        description="이름·로그인 ID·회원등급 등은 관리자만 변경할 수 있습니다. 그 외 연락처와 비밀번호는 직접 수정할 수 있습니다."
      />

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
        <Section title="기본 정보">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="이름 (변경 불가)">
              <input value={snapshot.name} disabled className={`${inputClass} bg-slate-50 text-slate-400`} />
            </Field>
            <Field label="로그인 ID (변경 불가)">
              <input value={snapshot.loginId} disabled className={`${inputClass} bg-slate-50 text-slate-400`} />
            </Field>
            <Field label="영어 이름 (선택)">
              <input value={form.englishName} onChange={set("englishName")} className={inputClass} />
            </Field>
            <Field label="성별 (선택)">
              <select value={form.sex} onChange={set("sex")} className={inputClass}>
                <option value="">선택 안 함</option>
                <option value="MALE">남</option>
                <option value="FEMALE">여</option>
              </select>
            </Field>
            <Field label="생년월일 (선택)">
              <input type="date" value={form.birthDate} onChange={set("birthDate")} className={inputClass} />
            </Field>
            <Field label="직업 (선택)">
              <input value={form.occupation} onChange={set("occupation")} className={inputClass} />
            </Field>
          </div>
        </Section>

        <Section title="연락처">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="거주 지역 (선택)">
              <select value={form.region} onChange={set("region")} className={inputClass}>
                <option value="">선택 안 함</option>
                <option value="KOREA">한국</option>
                <option value="CHINA">중국</option>
                <option value="VIETNAM">베트남</option>
                <option value="JAPAN">일본</option>
                <option value="AUSTRALIA">호주</option>
                <option value="USA_OTHER">미국 및 기타</option>
              </select>
            </Field>
            <Field label="주소 (선택)">
              <input value={form.address} onChange={set("address")} className={inputClass} />
            </Field>
            <Field label="휴대전화 (선택)">
              <input value={form.mobilePhone} onChange={set("mobilePhone")} className={inputClass} />
            </Field>
            <Field label="이메일 (선택)">
              <input type="email" value={form.email} onChange={set("email")} className={inputClass} />
            </Field>
            <Field label="카카오톡 ID (선택)">
              <input value={form.kakaoId} onChange={set("kakaoId")} className={inputClass} />
            </Field>
            <Field label="위챗 ID (선택)">
              <input value={form.wechatId} onChange={set("wechatId")} className={inputClass} />
            </Field>
          </div>
        </Section>

        <Section title="수업 관련">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="희망 수업 방법 (선택)">
              <select value={form.preferredClassMethod} onChange={set("preferredClassMethod")} className={inputClass}>
                <option value="">선택 안 함</option>
                <option value="teams">Teams</option>
                <option value="zoom">Zoom</option>
                <option value="tencent">Tencent (VooV Meeting)</option>
              </select>
            </Field>
            <Field label="Teams ID (선택)">
              <input value={form.teamsId} onChange={set("teamsId")} className={inputClass} />
            </Field>
          </div>
        </Section>

        <Section title="비밀번호 변경">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="새 비밀번호 (선택)">
              <input
                type="password"
                value={form.newPassword}
                onChange={set("newPassword")}
                placeholder="변경 시에만 입력"
                className={inputClass}
              />
            </Field>
            <Field label="새 비밀번호 확인">
              <input
                type="password"
                value={form.newPasswordConfirm}
                onChange={set("newPasswordConfirm")}
                placeholder="변경 시에만 입력"
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        {saved && <p className="text-sm font-medium text-emerald-600">저장되었습니다.</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-fit rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </form>
    </Container>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <h3 className="text-sm font-bold text-brand-950">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
