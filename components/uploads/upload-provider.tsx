"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getUploadManager, type UploadManager } from "@/lib/client/uploads/manager";
import { UploadTray } from "./upload-tray";

/**
 * Owns the upload manager for the whole admin area.
 *
 * Mounted in the dashboard LAYOUT rather than on the library page: an upload
 * must keep running when the user navigates elsewhere, and a page-level
 * provider would unmount and kill it.
 */

const UploadCtx = createContext<UploadManager | null>(null);

export function useUploadContext(): UploadManager {
  const m = useContext(UploadCtx);
  if (!m) throw new Error("useUploadContext must be used inside <UploadProvider>.");
  return m;
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const manager = getUploadManager();
  const router = useRouter();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void manager.restore();
  }, [manager]);

  useEffect(() => manager.onItemCreated(() => router.refresh()), [manager, router]);

  // Warn before leaving with work in flight. Browsers show their own generic
  // text; the returnValue assignment is what actually arms the prompt.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!manager.hasActive()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [manager]);

  // Pause on connection loss rather than burning the retry budget offline.
  useEffect(() => {
    const onOffline = () => manager.pauseAll();
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [manager]);

  return (
    <UploadCtx.Provider value={manager}>
      {children}
      <UploadTray />
    </UploadCtx.Provider>
  );
}
