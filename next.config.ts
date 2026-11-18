import type { NextConfig } from "next";

// STATIC_EXPORT=1 → خروجی استاتیک برای شل اندروید (Capacitor)
const nextConfig: NextConfig = {
  ...(process.env.STATIC_EXPORT ? { output: "export" as const } : {}),
  env: { NEXT_PUBLIC_STATIC_GAME: process.env.STATIC_EXPORT ? "1" : "0" },
};

export default nextConfig;
