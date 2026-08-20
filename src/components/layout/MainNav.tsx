import { ChevronDown } from "lucide-react";
import { NAV_ITEMS } from "../../data/nav";
import { NavItemLink } from "./NavItemLink";

export function MainNav() {
  return (
    <nav className="hidden md:block">
      <ul className="flex items-center justify-center">
        {NAV_ITEMS.map((item) => (
          <li key={item.label} className="group relative">
            {item.href ? (
              <NavItemLink
                href={item.href}
                scrollTo={item.scrollTo}
                className="flex items-center gap-1 px-4 py-4 text-[15px] font-semibold text-brand-950 transition hover:text-brand-600 lg:px-5"
              >
                {item.label}
                {item.children && (
                  <ChevronDown
                    size={14}
                    className="text-slate-400 transition group-hover:rotate-180 group-hover:text-brand-600"
                  />
                )}
              </NavItemLink>
            ) : (
              <span className="flex cursor-default items-center gap-1 px-4 py-4 text-[15px] font-semibold text-brand-950 lg:px-5">
                {item.label}
                {item.children && (
                  <ChevronDown
                    size={14}
                    className="text-slate-400 transition group-hover:rotate-180 group-hover:text-brand-600"
                  />
                )}
              </span>
            )}

            {item.children && (
              <div className="pointer-events-none absolute left-1/2 top-full z-30 w-52 -translate-x-1/2 pt-1 opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
                <div className="overflow-hidden rounded-xl border border-slate-100 bg-white py-2 shadow-[0_12px_32px_rgba(20,44,88,0.14)]">
                  {item.children.map((child) => (
                    <NavItemLink
                      key={child.label}
                      href={child.href}
                      scrollTo={child.scrollTo}
                      className="block px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
                    >
                      {child.label}
                    </NavItemLink>
                  ))}
                </div>
              </div>
            )}

            <span className="pointer-events-none absolute inset-x-4 bottom-1.5 h-0.5 scale-x-0 rounded-full bg-brand-600 transition-transform duration-200 group-hover:scale-x-100" />
          </li>
        ))}
      </ul>
    </nav>
  );
}
