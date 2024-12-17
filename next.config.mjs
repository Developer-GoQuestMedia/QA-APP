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
};

export default nextConfig;
