import { type JSX, For, createSignal, onCleanup, onMount } from "solid-js";
import { PebbleModel } from "./PebbleModel";
import { Turntable } from "./Turntable";
import { Reveal } from "./motion";
import { AutoVideo, Figure, SpecChip, SpotlightCard } from "./components";

/** URL of the studio app. From /landing/ the studio root is one level up.
 *  Deliberately linked ONLY at the end of the page — the landing tells the
 *  story first, then hands the visitor to the studio. */
const STUDIO_URL = "../";

/** All imagery is a render of the real v14 CAD — see marketing/README.md. */
const MEDIA = "../landing-media/";

// ---------------------------------------------------------------------------
// Hero — dark stage, oversized display type, then a scroll-scrubbed turntable.
// No studio link here by design.
// ---------------------------------------------------------------------------
const SPECS = [
  { icon: "🖼️", label: 'מסך Spectra-6 בגודל "4' },
  { icon: "🌈", label: "שישה צבעי דיו" },
  { icon: "🎛️", label: "Raspberry Pi Pico 2" },
  { icon: "💾", label: "כרטיס microSD" },
  { icon: "🔋", label: "טעינת USB-C" },
  { icon: "🪵", label: "מארז אלון מודפס" },
  { icon: "☁️", label: "בלי ענן ובלי מנוי" },
];

function Hero(): JSX.Element {
  return (
    // `overflow-clip`, NOT `overflow-hidden`. The turntable below is
    // `position: sticky`, and a sticky element sticks to its nearest scrolling
    // ancestor — `overflow: hidden` here makes this header exactly that, so the
    // pebble never pins and instead scrolls away leaving the rest of its track
    // blank. `clip` still contains the glow bleed but creates no scrollport.
    <header class="relative isolate overflow-clip px-6 pt-24 sm:pt-32">
      <div class="glow-hero" aria-hidden="true" />

      <div class="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        <span
          class="hero-rise inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/[0.07] px-4 py-1.5 text-sm font-medium text-amber-200"
          style={{ "--rise-delay": "0ms" }}
        >
          ✦ יש רק אחת כזאת
        </span>

        <h1
          class="font-display hero-rise mt-8 text-5xl text-zinc-50 sm:text-7xl"
          style={{ "--rise-delay": "120ms" }}
        >
          מסגרת תמונות
          <br />
          <span class="sheen">שמרגישה כמו נייר</span>
        </h1>

        <p
          class="hero-rise mt-7 max-w-xl text-lg leading-relaxed text-zinc-400"
          style={{ "--rise-delay": "240ms" }}
        >
          ‏Photo Pebble היא מסגרת תמונות בגודל כף יד עם מסך דיו אלקטרוני ‎4
          אינץ׳ בשישה צבעים. מעתיקים תמונות לכרטיס הזיכרון והיא מחליפה ביניהן
          לבד. טעינה אחת מחזיקה שבועות, בלי אפליקציה, בלי מנוי ובלי חיבור
          לאינטרנט.
        </p>

        <a
          href="#pebble"
          class="hero-rise mt-9 rounded-xl border border-white/15 bg-white/[0.05] px-6 py-3 text-base font-semibold text-zinc-100 backdrop-blur transition hover:border-amber-300/40 hover:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          style={{ "--rise-delay": "360ms" }}
        >
          בואו נסתכל מקרוב ↓
        </a>
      </div>

      {/* Scroll-scrubbed 360° — the pebble pins and turns as you scroll past.
          The CTA above points here rather than past it: this is the payoff,
          not something to skip. The caption rides inside the sticky stage. */}
      <Turntable
        id="pebble"
        class="mt-6 scroll-mt-0"
        track={2.1}
        caption="‏88 × 126 מ״מ, ‎30 מ״מ בנקודה הרחבה. שני כפתורי פליז בצד מדפדפים בין התמונות."
      />

      {/* Spec marquee — pauses on hover, static under reduced-motion */}
      <div class="relative z-10 mx-auto mt-16 max-w-5xl pb-20">
        <div class="marquee" aria-hidden="true">
          <div class="marquee-track">
            <For each={[...SPECS, ...SPECS]}>
              {(s) => <SpecChip icon={s.icon} label={s.label} />}
            </For>
          </div>
        </div>
        {/* Accessible static copy of the marquee content */}
        <ul class="sr-only">
          <For each={SPECS}>{(s) => <li>{s.label}</li>}</For>
        </ul>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sticky story chapter — the media pins while three captions scroll past.
// ---------------------------------------------------------------------------
type Chapter = {
  title: string;
  body: string;
  media: () => JSX.Element;
};

const CHAPTERS: Chapter[] = [
  {
    title: "מסך שמתנהג כמו דף נייר",
    body: "בפנים יש מסך דיו אלקטרוני עם שש כמוסות צבע: שחור, לבן, צהוב, אדום, כחול וירוק. שום דבר שם לא מאיר. כל נקודה על המסך היא טיפת דיו שזזה למקומה, ולכן התמונה נשארת גם כשמנתקים את החשמל.",
    media: () => (
      <img
        src={`${MEDIA}screen-sunset.png`}
        alt="תמונת שקיעה כפי שהיא מוצגת על המסך — פלטת שישה צבעים עם דיתרינג"
        class="eink-art mx-auto block w-full max-w-[300px] rounded-xl border border-white/10 shadow-2xl"
        loading="lazy"
        decoding="async"
      />
    ),
  },
  {
    title: "ישנה בלילה, חיה חודשים",
    body: "רוב הזמן היא פשוט ישנה. היא מתעוררת רק כדי להחליף תמונה, ובלילה גם זה לא קורה. טעינה אחת מחזיקה שבועות, לפעמים חודשים.",
    media: () => (
      <img
        src={`${MEDIA}hero-front34.webp`}
        alt="Photo Pebble בזווית שלושת־רבעי, מסגרת עץ אלון עם מסך דיו אלקטרוני"
        class="mx-auto block w-full rounded-2xl"
        loading="lazy"
        decoding="async"
      />
    ),
  },
  {
    title: "התמונות שלכם נשארות אצלכם",
    body: "אין כאן Wi-Fi ואין חשבון לפתוח. התמונות יושבות על כרטיס microSD, וההכנה שלהן קורית בדפדפן שלכם. שום קובץ לא עוזב את המחשב.",
    media: () => (
      <img
        src={`${MEDIA}hero-back34.webp`}
        alt="גב המסגרת — כיפת עץ חלקה וארבעה ברגים"
        class="mx-auto block w-full rounded-2xl"
        loading="lazy"
        decoding="async"
      />
    ),
  },
];

function Story(): JSX.Element {
  const [active, setActive] = createSignal(0);
  const refs: HTMLElement[] = [];

  onMount(() => {
    // A centre-line observer, not a threshold one. Captions are `min-h-screen`
    // on desktop, so at `threshold: 0.5` two adjacent captions are *both*
    // exactly half-visible at the boundary; they fire in the same batch and
    // whichever entry lands last wins, which makes the pinned media flicker.
    // Collapsing the root to a zero-height line at the viewport centre means
    // exactly one caption can ever be intersecting.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(refs.indexOf(entry.target as HTMLElement));
          }
        }
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    for (const el of refs) io.observe(el);
    onCleanup(() => io.disconnect());
  });

  return (
    <section id="story" class="relative scroll-mt-8 px-6">
      {/* ---- Phones: plain stacked chapters, no pinning --------------------
          A two-pane scrollytelling layout needs vertical room a phone does not
          have. Pinning a 46vh media strip above 70vh captions left every
          caption either grazing the underside of the pin or stranded in a huge
          gap below it, and the translucent `bg/80 + backdrop-blur` on the pin
          existed only to disguise text sliding underneath it. Below `lg` each
          chapter is simply its own image + text. */}
      <div class="mx-auto max-w-md space-y-20 py-16 lg:hidden">
        <For each={CHAPTERS}>
          {(c, i) => (
            <Reveal>
              {c.media()}
              <span class="font-display mt-7 block text-sm text-amber-300/80">
                0{i() + 1}
              </span>
              <h2 class="font-display mt-2 text-2xl text-zinc-50">{c.title}</h2>
              <p class="mt-4 leading-relaxed text-zinc-400">{c.body}</p>
            </Reveal>
          )}
        </For>
      </div>

      {/* ---- Desktop: media pins while the captions scroll past ----------- */}
      <div class="mx-auto hidden max-w-6xl gap-8 lg:grid lg:grid-cols-2">
        <div class="sticky top-0 flex h-screen items-center">
          <div class="story-stage relative mx-auto w-full max-w-md">
            <For each={CHAPTERS}>
              {(c, i) => (
                <div
                  class="story-scene"
                  classList={{ "is-active": active() === i() }}
                >
                  {c.media()}
                </div>
              )}
            </For>
          </div>
        </div>

        <div>
          <For each={CHAPTERS}>
            {(c, i) => (
              <div
                ref={(el) => (refs[i()] = el)}
                class="story-caption flex min-h-screen items-center"
                classList={{ "is-active": active() === i() }}
              >
                <div>
                  <span class="font-display text-sm text-amber-300/80">
                    0{i() + 1}
                  </span>
                  <h2 class="font-display mt-3 text-4xl text-zinc-50">
                    {c.title}
                  </h2>
                  <p class="mt-5 max-w-md text-lg leading-relaxed text-zinc-400">
                    {c.body}
                  </p>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// What's inside — the exploded animation plus the real bill of materials.
// ---------------------------------------------------------------------------
const PARTS = [
  {
    n: "01",
    t: "מסך Spectra-6",
    d: 'פאנל דיו אלקטרוני "4 ברזולוציה 600×400, שישה צבעים.',
  },
  {
    n: "02",
    t: "Raspberry Pi Pico 2",
    d: "קורא את הכרטיס ומצייר את התמונה על המסך.",
  },
  {
    n: "03",
    t: "שעון וסוללה",
    d: "שעון RTC שיודע מתי לילה, ספק כוח וסוללת 14500 נטענת.",
  },
  {
    n: "04",
    t: "שני מתגי MX",
    d: "מתגים מכניים, עם בוכנות פליז שמבצבצות מהצד.",
  },
  {
    n: "05",
    t: "שתי קליפות עץ",
    d: "‏PLA עם סיבי אלון, נסגרות בארבעה ברגי M3.",
  },
];

function Inside(): JSX.Element {
  return (
    <section id="inside" class="scroll-mt-8 px-6 py-24">
      <div class="mx-auto max-w-6xl">
        <Reveal class="mx-auto max-w-2xl text-center">
          <h2 class="font-display text-3xl text-zinc-50 sm:text-5xl">
            מה יש בפנים
          </h2>
          <p class="mt-5 text-lg text-zinc-400">
            מדדתי כל רכיב ואז בניתי את הקופסה סביבו. ככה זה נראה כשפותחים.
          </p>
        </Reveal>

        <div class="mt-14 grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
          <Reveal>
            <AutoVideo
              webm={`${MEDIA}exploded.webm`}
              mp4={`${MEDIA}exploded.mp4`}
              poster={`${MEDIA}hero-front34.webp`}
              alt="אנימציה של פירוק והרכבה של המסגרת — קליפה קדמית, מסך, לוח, מתגים וקליפה אחורית"
            />
          </Reveal>

          <Reveal delay={120}>
            <ol class="space-y-5">
              <For each={PARTS}>
                {(p) => (
                  <li class="flex gap-4">
                    <span class="font-display shrink-0 text-sm text-amber-300/70">
                      {p.n}
                    </span>
                    <div>
                      <h3 class="font-semibold text-zinc-100">{p.t}</h3>
                      <p class="mt-1 leading-relaxed text-zinc-400">{p.d}</p>
                    </div>
                  </li>
                )}
              </For>
            </ol>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bento feature grid — anchor cell + supporting cells, spotlight on hover.
// ---------------------------------------------------------------------------
const PALETTE = [
  "#1c1c1c",
  "#f4f1e9",
  "#d9b53a",
  "#b0473d",
  "#3f6098",
  "#4b7a52",
];

const CELLS = [
  {
    icon: "🎨",
    title: "סטודיו בדפדפן",
    body: "מכוונים בהירות, ניגודיות וגוונים עד שהתמונה מתיישבת יפה על שישה צבעים.",
  },
  {
    icon: "👁️",
    title: "רואים לפני",
    body: "התצוגה בסטודיו מראה בדיוק מה יֵצא על המסך, כולל הנקודות.",
  },
  {
    icon: "🔋",
    title: "טעינה נדירה",
    body: "מחברים כבל USB-C, וזהו לכמה שבועות טובים.",
  },
  {
    icon: "🌙",
    title: "שעות שקט",
    body: "בלילה היא לא מחליפה תמונות. אפשר להזיז את השעות.",
  },
  {
    icon: "🔒",
    title: "הכול נשאר מקומי",
    body: "אין שרת בסיפור הזה. התמונות נשארות אצלכם.",
  },
];

const cellClass =
  "h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-white/20";

function Features(): JSX.Element {
  return (
    <section id="features" class="scroll-mt-8 px-6 py-24">
      <div class="mx-auto max-w-6xl">
        <Reveal class="mx-auto max-w-2xl text-center">
          <h2 class="font-display text-3xl text-zinc-50 sm:text-5xl">
            עוד כמה דברים שיש בה
          </h2>
          <p class="mt-5 text-lg text-zinc-400">
            רוב זה נכנס פנימה כי משהו הציק לי ורציתי לתקן אותו.
          </p>
        </Reveal>

        <div class="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Anchor cell — the six-colour palette beside the real dithered art
              (in RTL the grid starts on the right, so this lands top-right) */}
          <Reveal class="sm:col-span-2">
            <SpotlightCard class={cellClass}>
              <div class="flex items-center gap-6">
                <div class="min-w-0 flex-1">
                  <div class="flex gap-2">
                    <For each={PALETTE}>
                      {(c) => (
                        <span
                          class="h-9 w-9 rounded-full ring-1 ring-white/20"
                          style={{ background: c }}
                        />
                      )}
                    </For>
                  </div>
                  <h3 class="mt-6 text-xl font-semibold text-zinc-50">
                    שישה צבעים
                  </h3>
                  <p class="mt-2 leading-relaxed text-zinc-400">
                    שחור, לבן, צהוב, אדום, כחול וירוק. אין דרך לערבב ביניהם, אז
                    התמונה נבנית מנקודות זעירות שמסתדרות לגוונים. מקרוב רואים את
                    הנקודות, וזה חלק מהיופי.
                  </p>
                </div>
                <img
                  src={`${MEDIA}screen-sunset.png`}
                  alt="דוגמה לתמונה אחרי דיתרינג לשישה צבעים"
                  class="eink-art hidden w-28 shrink-0 rounded-lg border border-white/10 sm:block"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </SpotlightCard>
          </Reveal>

          <For each={CELLS}>
            {(f, i) => (
              <Reveal delay={(i() % 3) * 90}>
                <SpotlightCard class={cellClass}>
                  <div class="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xl">
                    <span aria-hidden="true">{f.icon}</span>
                  </div>
                  <h3 class="mt-5 text-xl font-semibold text-zinc-50">
                    {f.title}
                  </h3>
                  <p class="mt-2 leading-relaxed text-zinc-400">{f.body}</p>
                </SpotlightCard>
              </Reveal>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Detail gallery — the macro renders.
// ---------------------------------------------------------------------------
const SHOTS = [
  {
    src: "hero-button.webp",
    alt: "תקריב של כפתור הפליז בצד המסגרת",
    caption: "כפתור פליז, יושב בתוך העץ",
  },
  {
    src: "hero-usbc.webp",
    alt: "תקריב של חיבור ה-USB-C בתחתית המסגרת",
    caption: "‏USB-C בתחתית, לטעינה",
  },
  {
    src: "hero-front-on.webp",
    alt: "מבט חזיתי מלא על המסגרת עם תמונת שקיעה",
    caption: "התמונה במלוא גודלה",
  },
];

function Gallery(): JSX.Element {
  return (
    <section class="px-6 pb-8">
      <div class="mx-auto max-w-6xl">
        <div class="grid gap-4 sm:grid-cols-3">
          <For each={SHOTS}>
            {(s, i) => (
              <Reveal delay={i() * 90}>
                <Figure
                  src={`${MEDIA}${s.src}`}
                  alt={s.alt}
                  caption={s.caption}
                  ratio="16 / 10"
                />
              </Reveal>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Craft / enclosure — copy beside the live, draggable 3D model.
// ---------------------------------------------------------------------------
function Craft(): JSX.Element {
  return (
    <section class="px-6 py-24">
      <div class="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <h2 class="font-display text-3xl text-zinc-50 sm:text-5xl">הקופסה</h2>
          <p class="mt-6 text-lg leading-relaxed text-zinc-400">
            רציתי משהו שנעים להחזיק, אז יצאה אבן נהר חלקה עם שני כפתורי פליז
            מוסתרים בצד. הדפסתי אותה כמה פעמים עד שהיא נסגרה כמו שצריך.
          </p>
          <p class="mt-4 text-lg leading-relaxed text-zinc-400">
            שתי קליפות מודפסות מ־PLA עם סיבי עץ אלון, נסגרות בארבעה ברגי M3.
            הכפתורים הם מתגי MX מכניים, והבוכנות שיוצאות מהצד מודפסות בפליז.
          </p>
          <p class="mt-6 text-sm text-zinc-400">
            מה שרואים כאן הוא קובץ ההדפסה עצמו. אפשר לגרור ולסובב אותו.
          </p>
        </Reveal>
        <Reveal delay={120} class="flex flex-col items-center gap-3">
          <PebbleModel initialYaw={0.15} />
          <span class="text-sm text-zinc-400">גררו כדי לסובב</span>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA — the single link to the studio lives here, at the very end.
// ---------------------------------------------------------------------------
function Cta(): JSX.Element {
  return (
    <section class="relative isolate overflow-clip px-6 py-32">
      <div class="glow-cta" aria-hidden="true" />
      <Reveal class="relative z-10 mx-auto max-w-2xl text-center">
        <h2 class="font-display text-4xl text-zinc-50 sm:text-6xl">
          רוצים להוסיף תמונות?
        </h2>
        <p class="mt-6 text-lg leading-relaxed text-zinc-400">
          פותחים את הסטודיו, בוחרים תמונות, מכווננים ומעתיקים לכרטיס. אפשר לחזור
          מתי שרוצים ולהוסיף עוד. מה שכבר על הכרטיס נשאר במקומו.
        </p>
        <a
          href={STUDIO_URL}
          class="glow-border mt-10 inline-block rounded-xl bg-amber-400 px-8 py-4 text-lg font-semibold text-zinc-950 shadow-[0_10px_40px_-8px_rgba(251,191,36,0.5)] transition hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0c]"
        >
          פתחו את הסטודיו ←
        </a>
      </Reveal>
    </section>
  );
}

function Footer(): JSX.Element {
  return (
    <footer class="border-t border-white/10 px-6 py-10 text-center text-sm text-zinc-400">
      Photo Pebble · הרכבתי את זה ביד ❤️
    </footer>
  );
}

export default function Landing(): JSX.Element {
  return (
    // Same trap as the header: `overflow-x: hidden` forces `overflow-y` to
    // compute to `auto`, which makes this a scroll container and silently
    // breaks every `position: sticky` on the page — the turntable AND the
    // story chapter. `overflow-x: clip` clips without a scrollport.
    <div class="min-h-screen overflow-x-clip bg-[#0a0a0c] text-zinc-200">
      <div class="grain" aria-hidden="true" />
      <Hero />
      <Story />
      <Inside />
      <Features />
      <Gallery />
      <Craft />
      <Cta />
      <Footer />
    </div>
  );
}
