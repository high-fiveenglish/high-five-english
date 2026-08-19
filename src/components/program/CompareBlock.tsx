import { X, Check } from "lucide-react";

type Side = { label: string; points: string[] };

export function CompareBlock({
  left,
  right,
  highlight,
}: {
  left: Side;
  right: Side;
  highlight: string;
}) {
  return (
    <div className="mt-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <p className="text-sm font-bold text-slate-500">{left.label}</p>
          <ul className="mt-4 space-y-2.5">
            {left.points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-slate-500">
                <X size={15} className="mt-0.5 shrink-0 text-slate-400" />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/70 p-6">
          <p className="text-sm font-bold text-brand-700">{right.label}</p>
          <ul className="mt-4 space-y-2.5">
            {right.points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-brand-900">
                <Check size={15} className="mt-0.5 shrink-0 text-brand-600" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-accent-500 px-6 py-4 text-center text-[15px] font-bold leading-relaxed text-white shadow-[0_10px_24px_rgba(248,114,26,0.25)]">
        {highlight}
      </div>
    </div>
  );
}
