import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type FaqEntry = { q: string; a: string };

function FaqItem({ q, a }: FaqEntry) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
      >
        <span className="text-[15px] font-bold text-brand-950">{q}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition ${open ? "rotate-180 text-brand-600" : ""}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-5 text-[14px] leading-relaxed text-slate-500 sm:px-6">{a}</div>
      )}
    </div>
  );
}

export function FaqAccordion({ items }: { items: FaqEntry[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <FaqItem key={item.q} q={item.q} a={item.a} />
      ))}
    </div>
  );
}
