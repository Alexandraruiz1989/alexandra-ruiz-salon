"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/service-worker.js")
        .catch((error) => {
          console.error("Error registrando service worker:", error);
        });
    }
  }, []);

  return null;
}