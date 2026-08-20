import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToHash() {
  const { pathname, state } = useLocation();
  const scrollTo = (state as { scrollTo?: string } | null)?.scrollTo;

  useEffect(() => {
    if (scrollTo) {
      let attempts = 0;
      let timer: ReturnType<typeof setTimeout>;
      const tryScroll = () => {
        const el = document.getElementById(scrollTo);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        attempts += 1;
        if (attempts < 20) timer = setTimeout(tryScroll, 50);
      };
      tryScroll();
      return () => clearTimeout(timer);
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, scrollTo]);

  return null;
}
