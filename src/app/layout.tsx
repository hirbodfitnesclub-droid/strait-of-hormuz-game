import type { Metadata, Viewport } from "next";

export const viewport: Viewport = { themeColor: "#082a32", width: "device-width", initialScale: 1, viewportFit: "cover" };
import type { ReactNode } from "react";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/800.css";
import "@fontsource/vazirmatn/900.css";
import "./harbor.css";

export const metadata: Metadata = {
  title: "تنگه هرمز | بازگشایی تنگه",
  description: "بندر را بسازید و کاروان‌ها را در ۴۵ عملیات از آبراه عبور دهید.",
  appleWebApp: { capable: true, title: "هرمز", statusBarStyle: "black-translucent" },
  icons: { icon: "/app-icon-192.png", apple: "/app-icon-192.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
