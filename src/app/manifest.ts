import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "تنگه هرمز: بازگشایی تنگه",
    short_name: "هرمز",
    description: "چراغ بندر را روشن نگه دارید و کاروان‌ها را به اسکله برسانید.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait",
    background_color: "#082a32", theme_color: "#082a32", lang: "fa", dir: "rtl",
    categories: ["games", "strategy"],
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
