import { render } from "solid-js/web";
import Landing from "./Landing";
// Reuse the studio's global stylesheet (Tailwind + base styles) so the promo
// page matches the app, but load only the two font faces this page actually
// renders — not the studio's full six-family set. See ./fonts.ts.
import "../src/index.css";
import "./fonts";
import "./landing.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

render(() => <Landing />, root);
