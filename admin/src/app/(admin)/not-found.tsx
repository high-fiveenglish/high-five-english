import Link from "next/link";

// 권한이 없거나(메뉴에 없는 화면을 URL로 직접 연 경우 포함) 존재하지 않는 화면 — 둘을 구분하지
// 않는다. 접근 권한이 없는 사람에게 그 화면/레코드가 있는지 알려주지 않기 위해서다.
export default function AdminNotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-xl font-bold text-slate-900">페이지를 찾을 수 없습니다</h1>
      <p className="mt-2 text-sm text-slate-500">주소가 올바르지 않거나, 이 화면을 볼 수 있는 권한이 없습니다.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
        홈으로
      </Link>
    </div>
  );
}
