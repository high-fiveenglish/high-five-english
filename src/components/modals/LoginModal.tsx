import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { Modal } from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";
import type { Role } from "../../lib/auth/types";
import { buildKakaoAuthorizeUrl } from "../../lib/kakaoAuth";

// 관리자 계정은 더 이상 이 사이트의 자체 /admin(예전 mock 패널)로 자동 이동하지 않는다 —
// 실제 관리자 페이지(별도 Next.js 앱)는 상단바의 "홈페이지관리" 링크에서 새 탭으로
// 연다(TopUtilityBar.tsx). 로그인 직후에는 방문 중이던 화면에 그대로 남는다.
const ROLE_HOME: Partial<Record<Role, string>> = {
  student: "/classroom",
  teacher: "/teacher",
};

export function LoginModal({
  open,
  onClose,
  onSwitchToFind,
}: {
  open: boolean;
  onClose: () => void;
  onSwitchToFind: () => void;
}) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation("auth");
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setId("");
    setPw("");
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !pw.trim()) return;
    setSubmitting(true);
    setError(null);
    const result = await login(id.trim(), pw);
    setSubmitting(false);
    if (!result.ok) {
      setError(t("login.invalid_credentials"));
      return;
    }
    handleClose();
    const home = ROLE_HOME[result.role];
    if (home) navigate(home);
  };

  return (
    <Modal open={open} onClose={handleClose} title={t("login.title")}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">
            {t("login.id_label")}
          </label>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder={t("login.id_placeholder")}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">
            {t("login.password_label")}
          </label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={t("login.password_placeholder")}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
            <p className="text-[13px] text-red-600">{error}</p>
          </div>
        )}

        <div className="pt-1 text-sm">
          <label className="flex items-center gap-1.5 text-slate-500">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            {t("login.remember_me")}
          </label>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? t("login.submitting") : t("login.submit")}
        </button>

        <div className="flex items-center justify-center gap-2 pt-1 text-sm">
          <button
            type="button"
            onClick={() => {
              handleClose();
              navigate("/signup");
            }}
            className="font-medium text-brand-600 hover:underline"
          >
            {t("login.signup_link")}
          </button>
          <span className="text-slate-300">·</span>
          <button
            type="button"
            onClick={onSwitchToFind}
            className="font-medium text-brand-600 hover:underline"
          >
            {t("login.find_account")}
          </button>
        </div>

        <div className="flex items-center gap-3 pt-1 text-xs text-slate-300">
          <div className="h-px flex-1 bg-slate-200" />
          {t("login.or_divider")}
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        <a
          href={buildKakaoAuthorizeUrl("login")}
          className="flex w-full items-center justify-center rounded-lg bg-[#FEE500] py-3 text-sm font-semibold text-[#191600] transition hover:brightness-95"
        >
          {t("login.kakao_login")}
        </a>

        <p className="pt-1 text-center text-xs text-slate-400">
          {t("login.demo_hint")}
        </p>
      </form>
    </Modal>
  );
}
