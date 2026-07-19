import { type JSX, type ParentProps, onCleanup, onMount, splitProps } from "solid-js";
import { Dynamic } from "solid-js/web";

/** True when the visitor asked the OS to minimise animation. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

type RevealProps = ParentProps<{
  /** Stagger in ms applied as the CSS transition-delay. */
  delay?: number;
  /** Extra classes merged onto the wrapper. */
  class?: string;
  /** Wrapper element tag; defaults to a div. */
  as?: "div" | "section" | "li" | "article";
}>;

/**
 * Wraps children in an element that fades/slides in the first time it scrolls
 * into view. Pure IntersectionObserver — no animation library. The `.reveal`
 * class (landing.css) supplies the transition; we only toggle `.is-visible`.
 */
export function Reveal(props: RevealProps): JSX.Element {
  const [, rest] = splitProps(props, ["delay", "class", "as", "children"]);
  let el: HTMLElement | undefined;

  onMount(() => {
    if (!el) return;
    // Under reduced motion the CSS already pins .reveal fully visible; skip the
    // observer entirely so content is present even if the callback never fires.
    if (prefersReducedMotion()) {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    onCleanup(() => io.disconnect());
  });

  return (
    <Dynamic
      component={props.as ?? "div"}
      ref={(node: HTMLElement) => (el = node)}
      class={`reveal ${props.class ?? ""}`}
      style={props.delay ? { "--reveal-delay": `${props.delay}ms` } : undefined}
      {...rest}
    >
      {props.children}
    </Dynamic>
  );
}
