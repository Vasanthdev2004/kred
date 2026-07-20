/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    // wagmi/rainbowkit pull in optional peer deps we don't use.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // The Coinbase/Base "baseAccount" connector (reached via wagmi's connectors
    // barrel) transitively imports @coinbase/cdp-sdk → @x402/* payment helpers
    // that aren't installed and that we never invoke. Stub the whole scope so the
    // bundler doesn't try to resolve it.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }),
    );
    // @metamask/sdk optionally requires React-Native async storage; stub it in web.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
