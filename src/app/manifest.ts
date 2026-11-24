import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "تنگه هرمز: فرمانروایی آب‌های آزاد",
    short_name: "هرمز",
    description: "اقتصاد بندر را بسازید، تنگه را حفظ کنید و فرمانروایی خود را گسترش دهید.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#11282a", theme_color: "#11282a", lang: "fa", dir: "rtl",
    categories: ["games", "strategy"],
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
