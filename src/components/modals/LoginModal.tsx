import { useState } from "react";
import { Modal } from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";

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
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [remember, setRemember] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !pw.trim()) return;
    login(id.trim());
    setId("");
    setPw("");
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="로그인">
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
          className="mt-2 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          로그인
        </button>
        <p className="pt-1 text-center text-xs text-slate-400">
          데모 화면입니다. 아이디/비밀번호를 입력하면 로그인 상태로 전환됩니다.
        </p>
      </form>
    </Modal>
  );
}
