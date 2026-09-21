import { useState, type ChangeEvent, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { useTenant } from "../context/TenantContext";

// 회원가입 화면. MyInfoPage(정보변경)와 같은 이유로 다국어 처리 없이 한국어로만
// 작성한다 — 둘 다 admin의 실제 Student DB에 바로 쓰는 "기능 화면"이지, 검색엔진에
// 노출되는 마케팅 콘텐츠(그래서 언어별 URL이 있는 /:lang/* 페이지들)가 아니다. 가입에
// 성공하면 곧바로 로그인 상태가 되어 "내 강의실"로 이동한다(로그인 폼과 동일한 흐름).
const inputClass =
  "w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

type FormState = {
  name: string;
  loginId: string;
  password: string;
  passwordConfirm: string;
  englishName: string;
  mobilePhone: string;
  email: string;
  consultRoute: string;
  preferredClassMethod: string;
  region: string;
  wechatId: string;
  kakaoId: string;
  referrerId: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  loginId: "",
  password: "",
  passwordConfirm: "",
  englishName: "",
  mobilePhone: "",
  email: "",
  consultRoute: "",
  preferredClassMethod: "",
  region: "",
  wechatId: "",
  kakaoId: "",
  referrerId: "",
};

export function SignupPage() {
  const { signup } = useAuth();
  const { lang } = useLanguage();
  const tenant = useTenant();
  const brandName = tenant.isHeadquarters ? "하이파이브 잉글리쉬" : tenant.name;
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof FormState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.loginId.trim() || !form.password) {
      setError("이름, 아이디, 비밀번호는 필수입니다.");
      return;
    }
    if (form.password.length < 4) {
      setError("비밀번호는 4자 이상이어야 합니다.");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (!agreeTerms || !agreePrivacy) {
      setError("이용약관과 개인정보처리방침에 모두 동의해주세요.");
      return;
    }

    setSubmitting(true);
    const result = await signup({
      name: form.name.trim(),
      loginId: form.loginId.trim(),
      password: form.password,
      englishName: form.englishName.trim(),
      mobilePhone: form.mobilePhone.trim(),
      email: form.email.trim(),
      consultRoute: form.consultRoute,
      preferredClassMethod: form.preferredClassMethod,
      region: form.region,
      wechatId: form.wechatId.trim(),
      kakaoId: form.kakaoId.trim(),
      referrerId: form.referrerId.trim(),
    });
    setSubmitting(false);

    if (!result.ok) {
      const message =
        result.code === "LOGIN_ID_TAKEN"
          ? "이미 사용 중인 아이디입니다."
          : result.code === "PASSWORD_TOO_SHORT"
            ? "비밀번호는 4자 이상이어야 합니다."
            : "회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.";
      setError(message);
      return;
    }
    navigate("/classroom", { replace: true });
  }

  return (
    <Container className="max-w-xl py-16">
      <SectionHeading
        align="left"
        eyebrow="회원가입"
        title={`${brandName} 회원가입`}
        description="가입은 무료이며, 가입 즉시 레벨테스트를 신청하실 수 있습니다."
      />

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
        <Section title="계정 정보">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="이름">
              <input value={form.name} onChange={set("name")} required className={inputClass} />
            </Field>
            <Field label="아이디">
              <input value={form.loginId} onChange={set("loginId")} required className={inputClass} />
            </Field>
            <Field label="비밀번호">
              <input
                type="password"
                value={form.password}
                onChange={set("password")}
                required
                className={inputClass}
              />
            </Field>
            <Field label="비밀번호 확인">
              <input
                type="password"
                value={form.passwordConfirm}
                onChange={set("passwordConfirm")}
                required
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section title="추가 정보 (선택)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="영어 이름">
              <input value={form.englishName} onChange={set("englishName")} className={inputClass} />
            </Field>
            <Field label="휴대전화">
              <input value={form.mobilePhone} onChange={set("mobilePhone")} className={inputClass} />
            </Field>
            <Field label="이메일">
              <input type="email" value={form.email} onChange={set("email")} className={inputClass} />
            </Field>
            <Field label="거주 지역">
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
            <Field label="희망 수업 방법">
              <select value={form.preferredClassMethod} onChange={set("preferredClassMethod")} className={inputClass}>
                <option value="">선택 안 함</option>
                <option value="teams">Teams</option>
                <option value="zoom">Zoom</option>
                <option value="tencent">Tencent (VooV Meeting)</option>
              </select>
            </Field>
            <Field label="상담루트">
              <select value={form.consultRoute} onChange={set("consultRoute")} className={inputClass}>
                <option value="">선택 안 함</option>
                <option value="KAKAOTALK">카카오톡</option>
                <option value="WECHAT">위챗</option>
              </select>
            </Field>
            <Field label="카카오톡 ID">
              <input value={form.kakaoId} onChange={set("kakaoId")} className={inputClass} />
            </Field>
            <Field label="위챗 ID">
              <input value={form.wechatId} onChange={set("wechatId")} className={inputClass} />
            </Field>
            <Field label="추천인 이름 또는 ID">
              <input value={form.referrerId} onChange={set("referrerId")} className={inputClass} />
            </Field>
          </div>
        </Section>

        <div className="flex flex-col gap-2 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            <Link to={`/${lang}/terms`} target="_blank" className="underline hover:text-brand-600">
              이용약관
            </Link>
            에 동의합니다 (필수)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={agreePrivacy}
              onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            <Link to={`/${lang}/privacy`} target="_blank" className="underline hover:text-brand-600">
              개인정보처리방침
            </Link>
            에 동의합니다 (필수)
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-fit rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "가입 처리 중..." : "회원가입"}
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
