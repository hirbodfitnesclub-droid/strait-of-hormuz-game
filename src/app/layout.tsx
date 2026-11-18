import type { Metadata, Viewport } from "next";

export const viewport: Viewport = { themeColor: "#11282a", width: "device-width", initialScale: 1, viewportFit: "cover" };
import type { ReactNode } from "react";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/800.css";
import "./globals.css";
import "./mobile-game.css";

export const metadata: Metadata = {
  title: "تنگه هرمز | فرمانروایی آب‌های آزاد",
  description: "بندرتان را بسازید، مدیر استخدام کنید و از آبراه دفاع کنید.",
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
