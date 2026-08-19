import { Link } from "react-router-dom";
import { Construction } from "lucide-react";
import { Container } from "../components/ui/Container";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <Construction size={28} />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-brand-950">{title}</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        해당 페이지는 현재 준비 중입니다. 빠른 시일 내에 자세한 내용으로
        찾아뵙겠습니다.
      </p>
      <Link
        to="/"
        className="mt-8 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        홈으로 돌아가기
      </Link>
    </Container>
  );
}
