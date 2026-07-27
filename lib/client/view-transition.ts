/** Run a DOM update inside a View Transition when the browser supports it. */
export function withViewTransition(update: () => void): void {
  const doc = typeof document !== "undefined" ? document : null;
  if (doc && typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => {
      update();
    });
    return;
  }
  update();
}
