"use client";

import { useEffect, useState } from "react";
import { flushOfflineApiQueue } from "./offline-api";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function AppInstallation() {
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);
    flushOfflineApiQueue().catch(() => undefined);

    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setInstallPrompt(null);
    });

    let cleanupUpdateChecks = () => undefined;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdateReady(worker);
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        const checkForUpdate = () => registration.update().catch(() => undefined);
        const checkWhenVisible = () => {
          if (document.visibilityState === "visible") checkForUpdate();
        };
        const interval = window.setInterval(checkForUpdate, 5 * 60 * 1000);
        window.addEventListener("focus", checkForUpdate);
        const handleOnline = () => {
          checkForUpdate();
          flushOfflineApiQueue().then(({ sent }) => {
            if (sent) window.dispatchEvent(new CustomEvent("folha-offline-synced", { detail: { sent } }));
          }).catch(() => undefined);
        };
        window.addEventListener("online", handleOnline);
        document.addEventListener("visibilitychange", checkWhenVisible);
        checkForUpdate();

        cleanupUpdateChecks = () => {
          window.clearInterval(interval);
          window.removeEventListener("focus", checkForUpdate);
          window.removeEventListener("online", handleOnline);
          document.removeEventListener("visibilitychange", checkWhenVisible);
        };
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }

    return () => {
      cleanupUpdateChecks();
      window.removeEventListener("beforeinstallprompt", captureInstall);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstallPrompt(null);
  }

  function update() {
    updateReady?.postMessage({ type: "SKIP_WAITING" });
  }

  if (updateReady)
    return (
      <aside className="app-update-card" role="status">
        <div>
          <b>Nova versão disponível</b>
          <span>A atualização preserva seus dados e acessos.</span>
        </div>
        <button onClick={update}>Atualizar agora</button>
      </aside>
    );

  if (!installPrompt || installed) return null;
  return (
    <button className="app-install-button" onClick={install}>
      <span aria-hidden="true">↓</span>
      Instalar Folha Rural
    </button>
  );
}
