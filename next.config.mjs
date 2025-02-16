/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXTAUTH_URL: process.env.NODE_ENV === 'production' 
      ? 'https://qa-app-brown.vercel.app'
      : process.env.NEXTAUTH_URL || 'http://localhost:3000',
    NEXT_PUBLIC_APP_URL: process.env.NODE_ENV === 'production'
      ? 'https://qa-app-brown.vercel.app'
      : 'http://localhost:3000',
    NEXT_PUBLIC_SOCKET_URL: process.env.NODE_ENV === 'production'
      ? 'https://qa-app-brown.vercel.app'
      : 'http://localhost:3000',
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    typedRoutes: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ]
      }
    ]
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        child_process: false,
        worker_threads: false,
        crypto: false,
        path: false,
        stream: false,
        buffer: false,
        util: false,
        process: false,
        events: false
      };
    }
    return config;
  },
  transpilePackages: ['socket.io-client', 'socket.io', 'engine.io-client']
};

export default nextConfig;
