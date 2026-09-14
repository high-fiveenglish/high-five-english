import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ADMIN_API_URL } from "../lib/adminApi";
import { linkedIdForRealStudent, type RealStudentData } from "../lib/realStudentBridge";

// 관리자 페이지의 "회원으로 로그인" → 여기로 넘어온다. admin은 별도 origin·별도(진짜)
// 학생 DB를 쓰므로, 이 mock 사이트에는 애초에 그 학생 계정이 존재하지 않는다. 그래서
// authService.login(ACCOUNTS 조회)을 거치지 않고, admin의 /api/public/sso/verify가
// 돌려준 검증된 정보로 AuthContext를 직접 채운다(hydrateActor) — 이후 "내 강의실" 등은
// apiToken으로 admin의 실제 데이터를 그때그때 불러온다(classroomBridgeService 등 참고).
type VerifyResponse = RealStudentData;

export function SsoLoginPage() {
  const [searchParams] = useSearchParams();
  const { hydrateActor } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = searchParams.get("token");
    if (!token) {
      setError("잘못된 접근입니다. 관리자 페이지에서 다시 시도해주세요.");
      return;
    }

    (async () => {
      let res: Response;
      try {
        res = await fetch(`${ADMIN_API_URL}/api/public/sso/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      } catch {
        setError("관리자 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      if (!res.ok) {
        setError("로그인 링크가 만료되었거나 유효하지 않습니다. 관리자 페이지에서 다시 시도해주세요.");
        return;
      }

      const data = (await res.json()) as VerifyResponse;
      const linkedId = linkedIdForRealStudent(data.studentId);

      hydrateActor(
        { role: "student", accountId: linkedId, linkedId, permissions: [] },
        data.englishName || data.name,
        null,
        data.apiToken,
        data.profile,
      );
      navigate("/classroom", { replace: true });
    })();
  }, [searchParams, hydrateActor, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <p className="max-w-sm text-center text-sm font-medium text-slate-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-400">로그인 처리 중입니다...</p>
    </div>
  );
}
