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
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve.fallback,
          fs: false,
          net: false,
          tls: false,
          punycode: false,
          querystring: false,
        },
        alias: {
          ...config.resolve.alias,
          punycode: false,
        }
      };
    }
    return config;
  },
  transpilePackages: ['socket.io-client']
};

export default nextConfig;
