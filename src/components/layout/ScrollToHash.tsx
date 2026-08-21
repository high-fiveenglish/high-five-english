import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToHash() {
  const { pathname, state, key } = useLocation();
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
    // `key` is a unique id react-router assigns to every navigation entry, even ones that
    // land on the same pathname + scrollTo as the previous entry (e.g. clicking "수강안내"
    // again after scrolling away manually). Without it in the deps, this effect only
    // re-ran when pathname or the scrollTo string actually changed value — so clicking the
    // same nav link twice in a row silently did nothing the second time.
  }, [pathname, scrollTo, key]);

  return null;
}
