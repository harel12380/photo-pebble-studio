/**
 * The single source of truth for which enclosure revision this landing page
 * shows. EVERY v-number on the page hangs off this: the STLs the 3D viewer
 * loads, and the CAD revision quoted in the copy.
 *
 * Do not edit by hand as part of a version bump — run
 *
 *     scripts/migrate-pebble-version.sh v16
 *
 * from the parent repo. It re-renders the marketing frames from the new CAD,
 * rebuilds every asset under `public/landing-media/`, copies the new print STLs
 * into `public/models/pebble-<ver>/`, and rewrites this file.
 *
 * The rendered imagery (hero stills, turntable frames, exploded clip) is
 * regenerated in place under the same filenames, so nothing else needs to know
 * the version — only the model path does.
 */
export const PEBBLE_VERSION = "v15";

/** Where the viewer fetches the real slicer STLs from, relative to /landing/. */
export const PEBBLE_MODEL_BASE = `../models/pebble-${PEBBLE_VERSION}/`;
