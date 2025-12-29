import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig = {
  transpilePackages: ['@react-three/fiber', '@react-three/drei', 'three', 'thirdweb', 'aframe-react'],
  webpack: (config, { isServer }) => {
    // Audio Support
    // Audio Support (Webpack 5 Native)
    config.module.rules.push({
      test: /\.(wav|mp3)$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/sounds/[name][ext][query]',
      },
    });

    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.reservoir.tools',
      },
      {
        protocol: 'https',
        hostname: 'ipfs.io',
      },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
      },
      {
        protocol: 'https',
        hostname: 'arweave.net',
      },
    ],
  },
  env: {
    THIRDWEB_CLIENT: process.env.THIRDWEB_CLIENT,
    MINT_CONTRACT: process.env.MINT_CONTRACT,
    DIAMOND_ADDRESS: process.env.DIAMOND_ADDRESS,
    PANEL_NAME_CHAT: process.env.PANEL_NAME_CHAT,
    PANEL_NAME_LEARN: process.env.PANEL_NAME_LEARN,
    PANEL_NAME_BUY: process.env.PANEL_NAME_BUY,
    PANEL_NAME_MYSPOT: process.env.PANEL_NAME_MYSPOT,
    REQUIRE_WALLET_FOR_CHAT: process.env.REQUIRE_WALLET_FOR_CHAT,
    MINT_SOON: process.env.MINT_SOON,
    USDC_CONTRACT_ADDRESS: process.env.USDC_CONTRACT_ADDRESS,
    USDC_CONTRACT_ADDRESS_TESTNET: process.env.USDC_CONTRACT_ADDRESS_TESTNET,
    MKVLI_TOKEN_ADDRESS: process.env.MKVLI_TOKEN_ADDRESS,
    MKVLI_TOKEN_ADDRESS_TESTNET: process.env.MKVLI_TOKEN_ADDRESS_TESTNET,
    PRICE_API_ENDPOINT: process.env.PRICE_API_ENDPOINT,
    DIRECTORY_FACET: process.env.DIRECTORY_FACET,
    DIAMOND_ADDRESS_TESTNET: process.env.DIAMOND_ADDRESS_TESTNET,
    MINT_CONTRACT_TESTNET: process.env.MINT_CONTRACT_TESTNET,
  },
};

export default nextConfig;