/**
 * Full page load. Used after signing in/out or switching business, so every screen
 * re-reads who you are and where your records live.
 */
export function hardNavigate(path: string): void {
  window.location.assign(path);
}
