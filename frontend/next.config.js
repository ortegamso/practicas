/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Optional: add other Next.js specific configurations here
  // For example, environment variables that need to be exposed to the browser
  env: {
    // NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL, // Already in .env
  },
  // Optional: if serving static assets from a different path or CDN in production
  // assetPrefix: process.env.NODE_ENV === 'production' ? '/your-cdn-prefix' : '',
};

module.exports = nextConfig;
