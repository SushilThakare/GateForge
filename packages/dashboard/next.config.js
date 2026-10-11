/**
 * @file packages/dashboard/next.config.js
 * @description Next.js 14 configuration file for GateForge Dashboard.
 * Configures transpilation for external Tremor component modules and App Router settings.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@tremor/react'],
};

module.exports = nextConfig;
