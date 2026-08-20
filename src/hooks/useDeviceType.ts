import { useState } from "react";

export type DeviceType = "pc" | "android" | "ios";

function detectDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "pc";
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "pc";
}

/** Best-effort device detection from the user agent, resolved once per page load.
 * Used only to visually emphasize the matching download button — never to hide the
 * other two, since UA sniffing can be wrong (e.g. tablets, unusual browsers). */
export function useDeviceType(): DeviceType {
  const [deviceType] = useState(detectDeviceType);
  return deviceType;
}
