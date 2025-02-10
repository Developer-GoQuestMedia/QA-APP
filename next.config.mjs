/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  experimental: {
    typedRoutes: true,
    esmExternals: 'loose'
  },
  // Configure dynamic routes
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
        ]
      }
    ]
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve.fallback,
          fs: false,
          net: false,
          tls: false,
          dns: false,
          child_process: false,
          punycode: false,
          querystring: false,
          path: false,
          crypto: false
        },
        alias: {
          ...config.resolve.alias,
          punycode: false,
        }
      };
    }
    return config;
  },
  transpilePackages: ['socket.io-client', 'socket.io', 'engine.io-client']
};

export default nextConfig;
