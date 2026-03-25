"use client";

import { useEffect } from "react";
import { isNativeApp, getCapacitor } from "@/lib/mobile/platform";

async function registerDevice() {
  try {
    const C = getCapacitor();
    const Device = C?.Plugins?.Device || C?.Device || null;
    const App = C?.Plugins?.App || C?.App || null;

    const info = (await Device?.getInfo?.()) || {};
    const lang = (await Device?.getLanguageCode?.())?.value || null;
    const appVersion = (await App?.getInfo?.()) || {};

    await fetch("/api/v1/me/mobile/device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plataforma: info?.platform?.toUpperCase?.() || "WEB",
        deviceUuid: (await Device?.getId?.())?.identifier || null,
        fabricante: info?.manufacturer || null,
        modelo: info?.model || null,
        soNome: info?.operatingSystem || null,
        soVersao: info?.osVersion || null,
        appVersao: appVersion?.version || null,
        buildNumber: appVersion?.build || null,
        idioma: lang || null,
      }),
    }).catch(() => {});
  } catch {}
}

async function setupPush() {
  try {
    const C = getCapacitor();
    const Push = C?.Plugins?.PushNotifications || C?.PushNotifications || null;
    if (!Push) return;

    await Push.requestPermissions?.();
    await Push.register?.();

    Push.addListener?.("registration", async (token: any) => {
      try {
        const value = token?.value || token?.token || null;
        if (!value) return;
        await fetch("/api/v1/me/mobile/push-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: "FCM", token: value }),
        });
      } catch {}
    });

    Push.addListener?.("pushNotificationReceived", async (_: any) => {});

    Push.addListener?.("pushNotificationActionPerformed", async (data: any) => {
      try {
        const link = data?.notification?.data?.deeplink || data?.notification?.data?.url || null;
        if (link && typeof window !== "undefined") {
          window.location.href = link;
        }
      } catch {}
    });
  } catch {}
}

export default function MobileBootstrap() {
  useEffect(() => {
    if (!isNativeApp()) return;
    registerDevice();
    setupPush();
  }, []);

  return null;
}

