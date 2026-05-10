import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 和 chokidar 是 Node.js native modules，不能被 webpack 打包
  serverExternalPackages: ['better-sqlite3', 'chokidar'],
};

export default nextConfig;
