import { type JSX, For, createSignal, onCleanup, onMount } from "solid-js";
import { Device, SceneLandscape, SceneNight, ScenePortrait } from "./Device";
import { Reveal } from "./motion";
import { Placeholder, SpecChip, SpotlightCard } from "./components";

/** URL of the studio app. From /landing/ the studio root is one level up.
 *  Deliberately linked ONLY at the end of the page — the landing tells the
 *  story first, then hands the visitor to the studio. */
const STUDIO_URL = "../";

// ---------------------------------------------------------------------------
// Hero — dark stage, spotlight glow, oversized display type. No studio link.
// ---------------------------------------------------------------------------
const SPECS = [
  { icon: "🖼️", label: 'מסך Spectra-6 בגודל "4' },
  { icon: "🌈", label: "שישה צבעים אמיתיים" },
  { icon: "🎛️", label: "Raspberry Pi Pico 2" },
  { icon: "💾", label: "כרטיס microSD" },
  { icon: "🔋", label: "טעינת USB-C" },
  { icon: "🖨️", label: "מעטפת מודפסת בתלת־ממד" },
  { icon: "☁️", label: "בלי ענן, בלי מנוי" },
];

function Hero(): JSX.Element {
  return (
    <header class="relative isolate overflow-hidden px-6 pb-20 pt-24 sm:pt-32">
      <div class="glow-hero" aria-hidden="true" />

      <div class="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        <span
          class="hero-rise inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/[0.07] px-4 py-1.5 text-sm font-medium text-amber-200"
          style={{ "--rise-delay": "0ms" }}
        >
          ✦ מתנה אחת ויחידה, בעבודת יד
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
          Photo Pebble היא מסגרת קטנה בדיו אלקטרוני שמציגה את התמונות שלכם בשישה
          צבעים — רכים, בלי סנוור ובלי זוהר של מסך. היא מתחלפת בין התמונות לבד,
          בלי אפליקציה ובלי מנוי.
        </p>

        <a
          href="#story"
          class="hero-rise mt-9 rounded-xl border border-white/15 bg-white/[0.05] px-6 py-3 text-base font-semibold text-zinc-100 backdrop-blur transition hover:border-amber-300/40 hover:bg-white/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          style={{ "--rise-delay": "360ms" }}
        >
          מה מיוחד בה? ↓
        </a>

        <div class="hero-rise mt-16 w-full" style={{ "--rise-delay": "480ms" }}>
          <Device />
        </div>
      </div>

      {/* Spec marquee — pauses on hover, static under reduced-motion */}
      <div class="relative z-10 mx-auto mt-16 max-w-5xl">
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

      <div class="scroll-cue mx-auto mt-12 hidden w-6 text-zinc-500 sm:block" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sticky story chapter — the device pins while three captions scroll past,
// each swapping the scene on the panel (Apple product-page pattern).
// ---------------------------------------------------------------------------
const CHAPTERS = [
  {
    title: "מסך שמתנהג כמו דף נייר",
    body: "בלב המסגרת נמצא מסך דיו אלקטרוני בשישה צבעים — שחור, לבן, צהוב, אדום, כחול וירוק. פלטה רכה ועיתונאית שנעימה לעין, והתמונה נשארת על המסך גם בלי חשמל.",
    scene: SceneLandscape,
  },
  {
    title: "ישנה בלילה, חיה חודשים",
    body: "בין ההחלפות המסגרת ישנה שינה עמוקה, ובשעות השקט היא לא מרעננת לחינם. טעינת USB-C אחת מספיקה לשבועות ואף חודשים.",
    scene: SceneNight,
  },
  {
    title: "התמונות שלכם נשארות אצלכם",
    body: "אין ענן, אין הרשמה ואין Wi-Fi. התמונות נשמרות על כרטיס microSD, וכל העיבוד קורה בדפדפן שלכם — שום דבר לא נשלח לשום שרת.",
    scene: ScenePortrait,
  },
];

function Story(): JSX.Element {
  const [active, setActive] = createSignal(0);
  const refs: HTMLElement[] = [];

  onMount(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(refs.indexOf(entry.target as HTMLElement));
          }
        }
      },
      { threshold: 0.5 },
    );
    for (const el of refs) io.observe(el);
    onCleanup(() => io.disconnect());
  });

  return (
    <section id="story" class="relative scroll-mt-8 px-6">
      <div class="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2">
        {/* Pinned device (top of grid on mobile, sticky column on desktop) */}
        <div class="sticky top-0 z-10 flex h-[46vh] items-center bg-[#0a0a0c]/80 backdrop-blur-sm lg:h-screen lg:bg-transparent lg:backdrop-blur-none">
          <Device float={false} class="scale-90 lg:scale-100">
            <For each={CHAPTERS}>
              {(c, i) => (
                <div
                  class="story-scene absolute inset-0"
                  classList={{ "is-active": active() === i() }}
                >
                  {c.scene()}
                </div>
              )}
            </For>
          </Device>
        </div>

        {/* Scrolling captions */}
        <div>
          <For each={CHAPTERS}>
            {(c, i) => (
              <div
                ref={(el) => (refs[i()] = el)}
                class="story-caption flex min-h-[70vh] items-center lg:min-h-screen"
                classList={{ "is-active": active() === i() }}
              >
                <div>
                  <span class="font-display text-sm text-amber-300/80">
                    0{i() + 1}
                  </span>
                  <h2 class="font-display mt-3 text-3xl text-zinc-50 sm:text-4xl">
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
// Bento feature grid — anchor cell + supporting cells, spotlight on hover.
// ---------------------------------------------------------------------------
const PALETTE = ["#1c1c1c", "#f4f1e9", "#d9b53a", "#b0473d", "#3f6098", "#4b7a52"];

const CELLS = [
  {
    icon: "🎨",
    title: "סטודיו לכל תמונה",
    body: "כלי דפדפן שמכוונן כל תמונה לפלטת המסך: בהירות, ניגודיות, איזון לבן ואלגוריתמי דיתרינג.",
  },
  {
    icon: "👁️",
    title: "תצוגה מקדימה חיה",
    body: "רואים מראש בדיוק איך התמונה תיראה על הפאנל — כולל סימולציה של הדיתרינג עצמו.",
  },
  {
    icon: "🔋",
    title: "סוללה לחודשים",
    body: "שינה עמוקה בין החלפות; טעינת USB-C אחת מספיקה לשבועות ואף חודשים.",
  },
  {
    icon: "🌙",
    title: "שעות שקט",
    body: "בלילה המסגרת נחה ולא מרעננת לחינם. הכול ניתן לכוונון.",
  },
  {
    icon: "🔒",
    title: "פרטיות מלאה",
    body: "כל העיבוד קורה במכשיר שלכם. התמונות לעולם לא נשלחות לשום שרת.",
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
            כל מה שהופך אותה למיוחדת
          </h2>
          <p class="mt-5 text-lg text-zinc-400">
            כל פרט נבחר כדי שהמתנה תרגיש אישית, שקטה ופשוטה לשימוש.
          </p>
        </Reveal>

        <div class="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Anchor cell — the six-colour palette (in RTL the grid starts on
              the right, so this lands in the top-right corner) */}
          <Reveal class="sm:col-span-2">
            <SpotlightCard class={cellClass}>
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
                שישה צבעים אמיתיים
              </h3>
              <p class="mt-2 max-w-lg leading-relaxed text-zinc-400">
                שחור, לבן, צהוב, אדום, כחול וירוק — כל פיקסל הוא דיו פיזי אמיתי,
                בלי תאורה אחורית. התוצאה נראית כמו הדפס עיתון צבעוני, לא כמו מסך.
              </p>
            </SpotlightCard>
          </Reveal>

          <For each={CELLS}>
            {(f, i) => (
              <Reveal delay={(i() % 3) * 90}>
                <SpotlightCard class={cellClass}>
                  <div class="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xl">
                    <span aria-hidden="true">{f.icon}</span>
                  </div>
                  <h3 class="mt-5 text-xl font-semibold text-zinc-50">{f.title}</h3>
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
// Craft / enclosure
// ---------------------------------------------------------------------------
function Craft(): JSX.Element {
  return (
    <section class="px-6 py-24">
      <div class="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <h2 class="font-display text-3xl text-zinc-50 sm:text-5xl">
            מעטפת בעבודת יד
          </h2>
          <p class="mt-6 text-lg leading-relaxed text-zinc-400">
            הקופסה עוצבה מאפס והודפסה בתלת־ממד במיוחד עבור המסגרת הזו — מותאמת
            לכל רכיב, עם רצועה לתלייה או להצבה. מתנה אחת ויחידה, לא מוצר מהמדף.
          </p>
          <p class="mt-4 text-lg leading-relaxed text-zinc-400">
            אפשר לתלות אותה בכל כיוון, ואת כיוון התמונה בוחרים בסטודיו.
          </p>
        </Reveal>
        <Reveal delay={120} class="grid gap-4 sm:grid-cols-2">
          <div class="parallax-slow">
            <Placeholder caption="תמונה: המעטפת מקרוב" ratio="1 / 1" />
          </div>
          <div class="parallax-fast">
            <Placeholder caption="תמונה: המסגרת בסלון" ratio="1 / 1" />
          </div>
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
    <section class="relative isolate overflow-hidden px-6 py-32">
      <div class="glow-cta" aria-hidden="true" />
      <Reveal class="relative z-10 mx-auto max-w-2xl text-center">
        <h2 class="font-display text-4xl text-zinc-50 sm:text-6xl">
          מוכנים להוסיף תמונות?
        </h2>
        <p class="mt-6 text-lg leading-relaxed text-zinc-400">
          פתחו את הסטודיו בדפדפן, בחרו תמונות, כוונו והעבירו לכרטיס. אפשר להחזיר
          את הכרטיס בכל זמן ולהוסיף עוד — התמונות הקיימות חוזרות בדיוק כפי שהיו.
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
    <footer class="border-t border-white/10 px-6 py-10 text-center text-sm text-zinc-500">
      Photo Pebble · מסגרת תמונות בדיו אלקטרוני, בעבודת יד ❤️
    </footer>
  );
}

export default function Landing(): JSX.Element {
  return (
    <div class="min-h-screen overflow-x-hidden bg-[#0a0a0c] text-zinc-200">
      <div class="grain" aria-hidden="true" />
      <Hero />
      <Story />
      <Features />
      <Craft />
      <Cta />
      <Footer />
    </div>
  );
}
