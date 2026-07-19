import { render, fireEvent, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { Modal, Select, Slider } from "./ui";

// Accessibility contract for the range Slider: it must expose a stable
// accessible name (not the live value span the wrapping <label> would fold in)
// and announce the *formatted* value via aria-valuetext, so screen-reader users
// hear "100%"/"+8" instead of the raw number the visual UI never shows.
describe("Slider a11y", () => {
  it("uses the label as the accessible name", () => {
    const { getByRole } = render(() => (
      <Slider label="Brightness" value={0} min={-50} max={50} onChange={() => {}} />
    ));
    expect(getByRole("slider")).toHaveAccessibleName("Brightness");
  });

  it("announces the formatted value via aria-valuetext and keeps it in sync", () => {
    const [value, setValue] = createSignal(0.5);
    const { getByRole } = render(() => (
      <Slider
        label="Strength"
        value={value()}
        min={0}
        max={1}
        step={0.01}
        display={(v) => `${Math.round(v * 100)}%`}
        onChange={setValue}
      />
    ));
    const slider = getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuetext", "50%");

    fireEvent.input(slider, { target: { value: "1" } });
    expect(slider).toHaveAttribute("aria-valuetext", "100%");
  });

  it("omits aria-valuetext when no display formatter is given", () => {
    const { getByRole } = render(() => (
      <Slider label="Zoom" value={2} min={1} max={4} onChange={() => {}} />
    ));
    expect(getByRole("slider")).not.toHaveAttribute("aria-valuetext");
  });

  // The indigo progress fill replaces the inert appearance-none accent-color so
  // the track shows how far along the value sits, not just the thumb. Its width
  // is the value's position as a percentage of the [min,max] range (clamped),
  // and it grows from the inline-start edge so it stays RTL-correct.
  it("renders a progress fill sized to the value's position in the range", () => {
    const { container } = render(() => (
      <Slider label="Brightness" value={0} min={-50} max={50} onChange={() => {}} />
    ));
    const fill = container.querySelector("span.bg-indigo-600") as HTMLElement;
    expect(fill).toBeTruthy();
    // The anchor end (track-edge origin) sits at the real edge (0%); the value end
    // rides the thumb centre — mapped through the thumb's inset travel band — so
    // the fill ends under the handle instead of overshooting it (see Slider).
    expect(fill.style.getPropertyValue("inset-inline-start")).toBe("0%");
    expect(fill.style.width).toBe("calc(0% + calc(0.5rem + 0.5 * (100% - 1rem)))");
  });

  it("clamps the progress fill to [0,100]% for out-of-range values", () => {
    const { container } = render(() => (
      <Slider label="Strength" value={5} min={0} max={1} onChange={() => {}} />
    ));
    const fill = container.querySelector("span.bg-indigo-600") as HTMLElement;
    // A full unipolar slider fills from the real left edge to the thumb centre.
    expect(fill.style.getPropertyValue("inset-inline-start")).toBe("0%");
    expect(fill.style.width).toBe("calc(0% + calc(0.5rem + 1 * (100% - 1rem)))");
  });

  // A bipolar slider anchors the fill at a neutral origin so it spans from
  // neutral to the thumb (empty at rest), not from the track edge (half-full).
  it("grows the fill outward from a non-edge origin", () => {
    const { container } = render(() => (
      <Slider label="Brightness" value={25} min={-50} max={50} origin={0} onChange={() => {}} />
    ));
    const fill = container.querySelector("span.bg-indigo-600") as HTMLElement;
    // origin 0 sits at 50% of the track, value 25 at 75% — both mapped through the
    // thumb band so the fill runs from the neutral handle position to the value's.
    expect(fill.style.getPropertyValue("inset-inline-start")).toBe("calc(0.5rem + 0.5 * (100% - 1rem))");
    expect(fill.style.width).toBe(
      "calc(calc(0.5rem + 0.75 * (100% - 1rem)) - calc(0.5rem + 0.5 * (100% - 1rem)))",
    );
  });

  it("places an origin-anchored fill on the start side for negative values", () => {
    const { container } = render(() => (
      <Slider label="Brightness" value={-25} min={-50} max={50} origin={0} onChange={() => {}} />
    ));
    const fill = container.querySelector("span.bg-indigo-600") as HTMLElement;
    // value -25 sits at 25%; the fill runs from the value handle up to the 50%
    // origin handle (inset-inline-start is the lower edge).
    expect(fill.style.getPropertyValue("inset-inline-start")).toBe("calc(0.5rem + 0.25 * (100% - 1rem))");
    expect(fill.style.width).toBe(
      "calc(calc(0.5rem + 0.5 * (100% - 1rem)) - calc(0.5rem + 0.25 * (100% - 1rem)))",
    );
  });

  it("shows no fill when an origin-anchored value sits exactly at the origin", () => {
    const { container } = render(() => (
      <Slider label="Brightness" value={0} min={-50} max={50} origin={0} onChange={() => {}} />
    ));
    const fill = container.querySelector("span.bg-indigo-600") as HTMLElement;
    // Both edges collapse onto the same handle position, so the width is a
    // self-subtraction that resolves to zero (no fill at rest).
    expect(fill.style.width).toBe(
      "calc(calc(0.5rem + 0.5 * (100% - 1rem)) - calc(0.5rem + 0.5 * (100% - 1rem)))",
    );
  });
});

// The custom Select keeps focus on the trigger button (its options aren't
// focusable), so screen readers learn which option is active only via
// aria-activedescendant pointing at the active <li>. Without it, arrow-key
// navigation moves the visible highlight silently. Contract: closed → no
// activedescendant; open → it tracks the active option's id, which exists.
describe("Select a11y", () => {
  const OPTS = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ];

  it("exposes no active descendant while closed", () => {
    const { getByRole } = render(() => (
      <Select value="b" options={OPTS} onChange={() => {}} aria-label="Greek" />
    ));
    expect(getByRole("button")).not.toHaveAttribute("aria-activedescendant");
  });

  it("points aria-activedescendant at the selected option on open, and the id resolves", () => {
    const { getByRole } = render(() => (
      <Select value="b" options={OPTS} onChange={() => {}} aria-label="Greek" />
    ));
    const button = getByRole("button");
    fireEvent.click(button);
    const desc = button.getAttribute("aria-activedescendant");
    expect(desc).toBeTruthy();
    // The id must resolve to the *selected* option (Beta), not just any option.
    const active = document.getElementById(desc!);
    expect(active).toHaveAttribute("role", "option");
    expect(active).toHaveTextContent("Beta");
  });

  it("moves the active descendant as the user arrows down", () => {
    const { getByRole } = render(() => (
      <Select value="b" options={OPTS} onChange={() => {}} aria-label="Greek" />
    ));
    const button = getByRole("button");
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const active = document.getElementById(button.getAttribute("aria-activedescendant")!);
    expect(active).toHaveTextContent("Gamma");
  });
});

// A dialog must take focus when it opens, keep Tab cycling inside it, and hand
// focus back to the trigger when it closes — otherwise keyboard/screen-reader
// users are left tabbing through the inert page behind the backdrop.
describe("Modal focus management", () => {
  it("moves focus to the dialog on open and restores it to the trigger on close", () => {
    const [open, setOpen] = createSignal(false);
    // The dialog Portals to <body>, so query through `screen`, not the container.
    render(() => (
      <div>
        <button onClick={() => setOpen(true)}>Open</button>
        <Modal open={open()} onClose={() => setOpen(false)} title="Export">
          <button>Save</button>
        </Modal>
      </div>
    ));
    const trigger = screen.getByText("Open");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    setOpen(true);
    // Focus lands on the dialog container (tabindex=-1), not the × Close button,
    // so Enter/Space can't accidentally dismiss it the instant it appears.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(dialog);

    setOpen(false);
    // Focus returns to whatever was focused before the dialog opened.
    expect(document.activeElement).toBe(trigger);
  });

  it("wraps Tab from the last focusable back to the first", () => {
    const [open, setOpen] = createSignal(true);
    render(() => (
      <Modal open={open()} onClose={() => setOpen(false)} title="Export">
        <button>Body</button>
      </Modal>
    ));
    // DOM order of focusables: × Close (header), then the body button. Tab off
    // the last one (the body button) must cycle back to the first (Close).
    const close = screen.getByLabelText("Close");
    const body = screen.getByText("Body");
    body.focus();
    fireEvent.keyDown(body, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });

  it("wraps Shift+Tab from the first focusable back to the last", () => {
    const [open, setOpen] = createSignal(true);
    render(() => (
      <Modal open={open()} onClose={() => setOpen(false)} title="Export">
        <button>Body</button>
      </Modal>
    ));
    const close = screen.getByLabelText("Close");
    const body = screen.getByText("Body");
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(body);
  });
});
