// 이 폴더(관리자 화면) 전체의 공용 로딩 상태 — 사이드바 메뉴를 눌러 다른 관리
// 화면으로 이동할 때, 그 화면의 서버 컴포넌트가 DB에서 데이터를 읽어오는 동안
// Next.js가 자동으로 이 화면을 보여준다(파일명 규칙: app router의 loading.tsx).
// 각 페이지가 실제 DB 데이터를 매번 새로 조회하는 구조라(정적 캐싱 불가) 완전히
// 없앨 수는 없는 대기시간이지만, 화면이 그냥 멈춰있는 것처럼 보이던 것을 즉시
// 반응하는 느낌으로 바꿔 체감 버퍼링을 줄인다.
export default function AdminLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-6 w-40 rounded bg-slate-200" />
      <div className="flex flex-col gap-3">
        <div className="h-24 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="mt-3 h-4 w-2/3 rounded bg-slate-100" />
        </div>
        <div className="h-24 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="mt-3 h-4 w-2/3 rounded bg-slate-100" />
        </div>
        <div className="h-24 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="mt-3 h-4 w-2/3 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}
