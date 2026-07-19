/**
 * Re-export of the shared on-card contract.
 *
 * Engine modules import from '../cardFormat'; this keeps those imports working
 * while the actual source of truth lives in @pebble/shared (so the studio and
 * the firmware can never drift).
 */
export * from "@pebble/shared/cardFormat";
