import type { NextConfig } from "next";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  // Lolipop! Deploy Now runs the traced Node server in .next/standalone.
  // Vercel continues to deploy with its own Next.js runtime.
  output: "standalone",
  poweredByHeader: false,
  // Keep server.js at .next/standalone/server.js for this repository.
  outputFileTracingRoot: projectRoot,
  turbopack: { root: projectRoot },
  env: {
    // Inlined at build time. "1" only when Vercel sets VERCEL=1.
    NEXT_PUBLIC_VERCEL_DEPLOYMENT: process.env.VERCEL === "1" ? "1" : "0",
  },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    ];
    if (process.env.NODE_ENV === "production") {
      security.push({ key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://adm.shinobi.jp https://*.shinobi.jp https://*.cnobi.jp; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.shinobi.jp https://*.cnobi.jp; font-src 'self'; connect-src 'self' https://*.shinobi.jp https://*.cnobi.jp; frame-src https://*.shinobi.jp https://*.cnobi.jp; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'" });
    }
    return [
      { source: "/:path*", headers: security },
      { source: "/sw.js", headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        { key: "Service-Worker-Allowed", value: "/" },
      ] },
    ];
  },
};

export default nextConfig;
