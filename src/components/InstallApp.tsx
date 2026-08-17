"use client";

import { useEffect, useRef, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installation remains optional; the public website must keep working.
    });
  }, []);
  return null;
}

export function InstallApp() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const standalone = isStandalone();
      setInstalled(standalone);
      setShowIosInstall(isIos() && !standalone);
    });

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowIosInstall(false);
    };

    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (installed || (!installPrompt && !showIosInstall)) return null;

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
      return;
    }
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button type="button" className="btn btn-ghost install-app-button" onClick={install}>
        Install app
      </button>
      <dialog className="install-app-dialog" ref={dialogRef} aria-labelledby="install-app-title">
        <form method="dialog">
          <button className="install-app-close" aria-label="Close install instructions">×</button>
          <p className="board-kicker">Add to iPhone or iPad</p>
          <h2 id="install-app-title">Keep IPOBharosa on your Home Screen</h2>
          <ol>
            <li>Tap the <strong>Share</strong> button in Safari.</li>
            <li>Choose <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong>. It will open like an app.</li>
          </ol>
          <button className="btn" value="close">Done</button>
        </form>
      </dialog>
    </>
  );
}
