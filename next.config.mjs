/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXTAUTH_URL: process.env.NODE_ENV === 'production' 
      ? 'https://qa-app-inky.vercel.app'
      : process.env.NEXTAUTH_URL || 'http://localhost:3000',
    NEXT_PUBLIC_APP_URL: process.env.NODE_ENV === 'production'
      ? 'https://qa-app-inky.vercel.app'
      : 'http://localhost:3000',
    NEXT_PUBLIC_SOCKET_URL: process.env.NODE_ENV === 'production'
      ? 'https://qa-app-inky.vercel.app'
      : 'http://localhost:3000',
    // Redis configuration
    REDIS_URL: process.env.NODE_ENV === 'production'
      ? 'https://decent-tadpole-13663.upstash.io'
      : 'redis://127.0.0.1:6379',
    REDIS_TOKEN: process.env.NODE_ENV === 'production'
      ? process.env.UPSTASH_REDIS_REST_TOKEN
      : '',
    UPSTASH_REDIS_REST_URL: process.env.NODE_ENV === 'production'
      ? 'https://decent-tadpole-13663.upstash.io'
      : 'redis://127.0.0.1:6379',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    typedRoutes: true,
  },
  // Ignore specific pages and routes
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self' https://*.vercel.app wss://*.vercel.app",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel.app",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.vercel.app wss://*.vercel.app ws://localhost:* http://localhost:* https://vercel.live",
              "frame-src 'self' https://*.vercel.app",
              "media-src 'self' blob:",
              "worker-src 'self' blob:",
              "manifest-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
              "upgrade-insecure-requests"
            ].join('; ')
          },
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
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ]
  },
  webpack: (config, { isServer, dev }) => {
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

    // Exclude director and srDirector related files
    config.module.rules.push({
      test: /\.(tsx|ts|jsx|js)$/,
      loader: 'ignore-loader',
      include: [
        /[\\/]app[\\/]allDashboards[\\/]director/,
        /[\\/]app[\\/]allDashboards[\\/]srDirector/,
        /[\\/]components[\\/]Director/,
        /[\\/]components[\\/]SrDirector/,
        /[\\/]components[\\/]providers[\\/]Director/,
        /[\\/]components[\\/]providers[\\/]SrDirector/,
      ],
    });

    return config;
  },
  transpilePackages: ['socket.io-client', 'socket.io', 'engine.io-client']
};

export default nextConfig;
