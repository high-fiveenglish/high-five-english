import { Link } from "react-router-dom";
import { BrandMark } from "./BrandMark";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className="group flex items-center gap-2.5"
      aria-label="하이파이브 잉글리쉬 홈"
    >
      <span className="transition-transform group-hover:scale-105">
        <BrandMark size={compact ? 32 : 38} />
      </span>
      <span className="flex flex-col leading-tight">
        <span
          className={`font-extrabold tracking-tight text-brand-950 ${
            compact ? "text-lg" : "text-xl sm:text-2xl"
          }`}
        >
          하이파이브 잉글리쉬
        </span>
        {!compact && (
          <span className="text-[11px] font-medium tracking-wide text-slate-400">
            1:1 화상영어
          </span>
        )}
      </span>
    </Link>
  );
}
