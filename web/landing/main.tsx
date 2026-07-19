import { render } from "solid-js/web";
import Landing from "./Landing";
// Reuse the studio's global stylesheet (Tailwind + base styles) and the
// self-hosted Hebrew fonts so the promo page matches the app and works offline.
import "../src/index.css";
import "../src/fonts";
import "./landing.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

render(() => <Landing />, root);
