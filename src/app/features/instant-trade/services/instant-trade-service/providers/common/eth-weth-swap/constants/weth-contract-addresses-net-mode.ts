import { BLOCKCHAIN_NAME } from '@shared/models/blockchain/blockchain-name';
import { ContractAddressesNetMode } from '@shared/models/blockchain/net-mode';

export const SUPPORTED_ETH_WETH_SWAP_BLOCKCHAINS = [
  BLOCKCHAIN_NAME.ETHEREUM,
  BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN,
  BLOCKCHAIN_NAME.POLYGON,
  BLOCKCHAIN_NAME.HARMONY,
  BLOCKCHAIN_NAME.AVALANCHE,
  BLOCKCHAIN_NAME.MOONRIVER,
  BLOCKCHAIN_NAME.FANTOM,
  BLOCKCHAIN_NAME.ARBITRUM
] as const;

export type SupportedEthWethSwapBlockchain = typeof SUPPORTED_ETH_WETH_SWAP_BLOCKCHAINS[number];

export const WETH_CONTRACT_ADDRESSES_NET_MODE: ContractAddressesNetMode<SupportedEthWethSwapBlockchain> =
  {
    mainnet: {
      [BLOCKCHAIN_NAME.ETHEREUM]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      [BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN]: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
      [BLOCKCHAIN_NAME.POLYGON]: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      [BLOCKCHAIN_NAME.HARMONY]: '0xcf664087a5bb0237a0bad6742852ec6c8d69a27a',
      [BLOCKCHAIN_NAME.AVALANCHE]: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      [BLOCKCHAIN_NAME.MOONRIVER]: '0x98878B06940aE243284CA214f92Bb71a2b032B8A',
      [BLOCKCHAIN_NAME.FANTOM]: '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',
      [BLOCKCHAIN_NAME.ARBITRUM]: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
    },
    testnet: {
      [BLOCKCHAIN_NAME.ETHEREUM]: '0xd0a1e359811322d97991e03f863a0c30c2cf029c',
      [BLOCKCHAIN_NAME.BINANCE_SMART_CHAIN]: '0xae13d989dac2f0debff460ac112a837c89baa7cd',
      [BLOCKCHAIN_NAME.POLYGON]: '0x13c038147aa2c91cf1fdb6f17a12f27715a4ca99',
      [BLOCKCHAIN_NAME.HARMONY]: '0xc0320368514b7961256d62bd7bc984623c0f7f65',
      [BLOCKCHAIN_NAME.AVALANCHE]: '0xd00ae08403B9bbb9124bB305C09058E32C39A48c',
      [BLOCKCHAIN_NAME.MOONRIVER]: undefined,
      [BLOCKCHAIN_NAME.FANTOM]: undefined,
      [BLOCKCHAIN_NAME.ARBITRUM]: undefined
    }
  };
