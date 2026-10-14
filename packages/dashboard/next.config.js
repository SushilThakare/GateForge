/**
 * @file packages/dashboard/next.config.js
 * @description Next.js 14 configuration file for GateForge Dashboard.
 * Configures transpilation for external Tremor component modules and App Router settings.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@tremor/react'],

  // output: 'standalone' instructs Next.js to create a self-contained server
  // bundle at .next/standalone. It traces and copies ONLY the node_modules files
  // actually imported at runtime — not the entire node_modules tree.
  // This shrinks the Docker image from ~1 GB → ~200-300 MB for a typical Next.js app.
  output: 'standalone',
};

module.exports = nextConfig;
