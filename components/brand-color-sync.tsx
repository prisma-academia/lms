"use client";

import { useEffect } from "react";

/**
 * Publishes the current tenant's brand colour to the document root as `--brand`
 * so root-level chrome (e.g. RouteProgress, mounted above the shells) can pick
 * it up. Resets on unmount / area change so untenanted areas fall back.
 */
export function BrandColorSync({ color }: { color?: string | null }) {
  useEffect(() => {
    const root = document.documentElement;
    if (color) {
      root.style.setProperty("--brand", color);
    } else {
      root.style.removeProperty("--brand");
    }
    return () => {
      root.style.removeProperty("--brand");
    };
  }, [color]);
  return null;
}
