import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Modal } from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";
import type { Role } from "../../lib/auth/types";

const ROLE_HOME: Record<Role, string> = {
  student: "/classroom",
  teacher: "/teacher",
  general_admin: "/admin",
  general_manager: "/admin",
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
      setError(result.message);
      return;
    }
    handleClose();
    navigate(ROLE_HOME[result.role]);
  };

  return (
    <Modal open={open} onClose={handleClose} title="로그인">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">
            아이디
          </label>
          <input
            type="text"
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="아이디를 입력하세요"
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-600">
            비밀번호
          </label>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호를 입력하세요"
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

        <div className="flex items-center justify-between pt-1 text-sm">
          <label className="flex items-center gap-1.5 text-slate-500">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            로그인 상태 유지
          </label>
          <button
            type="button"
            onClick={onSwitchToFind}
            className="font-medium text-brand-600 hover:underline"
          >
            아이디/비밀번호 찾기
          </button>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "확인 중..." : "로그인"}
        </button>
        <p className="pt-1 text-center text-xs text-slate-400">
          데모 계정 예시 — 학생: demo-student / student123, 강사: james / teacher123,
          관리자: admin1 / admin123, 매니저: manager / manager123
        </p>
      </form>
    </Modal>
  );
}
