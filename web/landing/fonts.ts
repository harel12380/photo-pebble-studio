/**
 * Fonts for the landing page only.
 *
 * The studio's `src/fonts.ts` self-hosts all six Hebrew families because the
 * message-card editor lets the user pick any of them. The landing uses exactly
 * two faces — Suez One for `.font-display` headings and Heebo for body copy
 * (see the `body` font stack in src/index.css) — so importing the studio module
 * here would drag in eight unused font files on a page whose whole pitch is
 * that it loads fast.
 */
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/700.css";
import "@fontsource/suez-one/400.css";
