/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';

const contentSecurityPolicy = isDev
  ? "default-src 'self'; img-src 'self' data: http://localhost:8080 https:; media-src 'self' http://localhost:8080 https:; connect-src 'self' http://localhost:8080 ws://localhost:8080 wss: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "default-src 'self'; img-src 'self' data: https:; connect-src 'self' https: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
      ],
    },
  ],
};

export default nextConfig;
