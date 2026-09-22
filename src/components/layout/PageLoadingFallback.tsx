import { Loader2 } from "lucide-react";

// route-level React.lazy() 페이지가 로드되는 동안 보여주는 최소한의 대기 화면.
// 빈 화면이 뜨는 걸 막는 게 목적이라 브랜드 컬러의 스피너 하나만 화면 중앙에
// 둔다 — 페이지마다 다른 레이아웃/스켈레톤을 따로 만들지 않는다(그건 각 페이지
// 컴포넌트가 로드된 뒤 자기 데이터 로딩 상태로 알아서 처리할 일).
export function PageLoadingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 size={28} className="animate-spin text-brand-500" />
    </div>
  );
}
