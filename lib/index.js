//#region lib/index.js
/**
 * Node half: a no-op Cordis plugin. All behavior lives in the browser half
 * (lib/client.js), which the web client module system discovers through the
 * package.json `dsh.client` declaration. This half exists so the plugin root
 * is a complete dual-face package and shows up as one entry in the host
 * Loader — and, via `dsh.bundle`, as a self-mounting bundle layer so that a
 * single `dsh plugin --profile web add github:…` fully activates it.
 */
/** Plugin name (= the config entry id). */
const name = "dsh-tool-autoexpand";
/** No host-side services are used. */
const inject = [];
/** No host-side behavior for this browser-surface plugin. */
function apply() {}
//#endregion
export { apply, inject, name };
