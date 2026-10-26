import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@velum/config", "@velum/contracts", "@velum/crypto", "@velum/db", "@velum/core"],
  serverExternalPackages: ["sharp"]
};

export default nextConfig;
