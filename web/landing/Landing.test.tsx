import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import Landing from "./Landing";

// jsdom has no IntersectionObserver; the landing's Reveal/Story observers
// need a stub that simply never fires (content visibility is CSS-only).
class IONoop {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IntersectionObserver ??= IONoop;

describe("Landing", () => {
  it("renders without crashing and shows the headline", () => {
    const { getByRole } = render(() => <Landing />);
    expect(getByRole("heading", { level: 1 })).toHaveTextContent(
      "מסגרת תמונות",
    );
  });

  // Design decision: the landing tells the product story first and hands the
  // visitor to the studio only at the very end — exactly one studio link,
  // located in the final CTA section (after story/features/craft).
  it("links to the studio exactly once, only at the end of the page", () => {
    const { container } = render(() => <Landing />);
    const studioLinks = [
      ...container.querySelectorAll<HTMLAnchorElement>('a[href="../"]'),
    ];
    expect(studioLinks).toHaveLength(1);

    // The single link must come after the story and features sections.
    const link = studioLinks[0];
    const story = container.querySelector("#story");
    const features = container.querySelector("#features");
    expect(story).not.toBeNull();
    expect(features).not.toBeNull();
    for (const section of [story, features]) {
      expect(
        section!.compareDocumentPosition(link) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    // And the hero (the h1's section) must not contain it.
    const hero = container.querySelector("header");
    expect(hero).not.toBeNull();
    expect(hero!.contains(link)).toBe(false);
  });
});
