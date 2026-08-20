import type { ReactNode } from "react";
import { LocalizedLink } from "../i18n/LocalizedLink";

export function NavItemLink({
  href,
  scrollTo,
  className,
  children,
  onClick,
}: {
  href: string;
  scrollTo?: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <LocalizedLink
      to={href}
      state={scrollTo ? { scrollTo } : undefined}
      className={className}
      onClick={onClick}
    >
      {children}
    </LocalizedLink>
  );
}
