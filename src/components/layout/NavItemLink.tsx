import { Link } from "react-router-dom";
import type { ReactNode } from "react";

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
    <Link
      to={href}
      state={scrollTo ? { scrollTo } : undefined}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
