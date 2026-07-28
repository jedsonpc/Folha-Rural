"use client";

import { useEffect, useState } from "react";

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

    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setInstallPrompt(null);
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((registration) => {
        if (registration.waiting) setUpdateReady(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setUpdateReady(worker);
          });
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }

    return () =>
      window.removeEventListener("beforeinstallprompt", captureInstall);
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
