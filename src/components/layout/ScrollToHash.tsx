import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToHash() {
  const { pathname, state, key } = useLocation();
  const scrollTo = (state as { scrollTo?: string } | null)?.scrollTo;

  useEffect(() => {
    if (scrollTo) {
      let attempts = 0;
      let timer: ReturnType<typeof setTimeout>;
      // Sections above the target (e.g. HomeNoticesSection/ReviewsSection) render null
      // until their async mock-service fetch resolves, so on a fresh mount (navigating
      // here from another page) the target can sit much higher in the layout than its
      // final position. Scrolling once as soon as the element merely EXISTS then landed
      // short once those sections popped in above it and pushed everything down — so
      // keep re-correcting for a settle window after the first scroll instead of firing
      // once and walking away.
      const settleDelays = [150, 400, 800, 1400];
      const correctScroll = (el: HTMLElement, remaining: number[]) => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        if (remaining.length === 0) return;
        timer = setTimeout(() => correctScroll(el, remaining.slice(1)), remaining[0]);
      };
      const tryScroll = () => {
        const el = document.getElementById(scrollTo);
        if (el) {
          correctScroll(el, settleDelays);
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
