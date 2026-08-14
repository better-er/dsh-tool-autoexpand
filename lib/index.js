// Host (node) half of the dsh-tool-autoexpand client plugin.
//
// This entry is mounted by the loader together with the browser half. The
// feature is pure browser-side (GUI) behavior, so the node half is intentionally
// empty. It must export an `apply` so the loader treats this package as a
// mountable Cordis plugin entry.

export function apply() {
  // Intentionally empty: everything happens in the browser (`./client`).
}
