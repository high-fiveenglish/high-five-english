import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function TopUtilityBar({
  onOpenLogin,
  onOpenFind,
}: {
  onOpenLogin: () => void;
  onOpenFind: () => void;
}) {
  const { isLoggedIn, userName, logout } = useAuth();

  return (
    <div className="hidden border-b border-slate-100 bg-brand-950 sm:block">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-4 px-5 py-1.5 text-xs text-white/70 sm:px-8">
        {isLoggedIn ? (
          <>
            <span className="text-white/90">
              <strong className="font-semibold text-accent-300">{userName}</strong>
              님, 환영합니다
            </span>
            <span className="h-3 w-px bg-white/20" />
            <Link to="/" className="transition hover:text-white">
              홈
            </Link>
            <Link to="/admin" className="transition hover:text-white">
              홈페이지관리
            </Link>
            <Link to="/mypage" className="transition hover:text-white">
              정보변경
            </Link>
            <button onClick={logout} className="transition hover:text-white">
              로그아웃
            </button>
          </>
        ) : (
          <>
            <Link to="/" className="transition hover:text-white">
              홈
            </Link>
            <button onClick={onOpenLogin} className="transition hover:text-white">
              로그인
            </button>
            <button onClick={onOpenFind} className="transition hover:text-white">
              ID/PW 찾기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
