import type { NextConfig } from "next";

// STATIC_EXPORT=1 → خروجی استاتیک برای شل اندروید (Capacitor)
const nextConfig: NextConfig = process.env.STATIC_EXPORT ? { output: "export" } : {};

export default nextConfig;
