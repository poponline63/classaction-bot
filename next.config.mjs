/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@libsql/client'],
  },
};

if (process.env.NEXT_DIST_DIR) {
  nextConfig.distDir = process.env.NEXT_DIST_DIR;
}

if (process.env.NEXT_STANDALONE === 'true') {
  nextConfig.output = 'standalone';
}

if (process.env.NEXT_DEPLOYMENT_ID) {
  nextConfig.deploymentId = process.env.NEXT_DEPLOYMENT_ID;
}

export default nextConfig;
