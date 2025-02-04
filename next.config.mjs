/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle punycode deprecation
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve.fallback,
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
  // Add transpilePackages for socket.io-client
  transpilePackages: ['socket.io-client'],
  // Enable CSS imports
  experimental: {
    esmExternals: 'loose'
  }
};

export default nextConfig;
