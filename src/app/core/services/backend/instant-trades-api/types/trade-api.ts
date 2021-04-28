import InputToken from 'src/app/shared/models/tokens/InputToken';

interface InstantTradesBlockchainNetwork {
  title: string;
}

interface InstantTradesContract {
  name: string;
  address: string;
  blockchain_network: InstantTradesBlockchainNetwork;
}

interface InstantTradesUser {
  username: 'string';
}

interface InstantTradesTokenApi extends InputToken {
  blockchain_network: string;
  coingecko_id: string;
  usd_price: number;
}

export interface InstantTradesRequestApi {
  hash: string;
  provider: string;
  network: string;
}

export interface InstantTradesResponseApi {
  hash: string;
  contract: InstantTradesContract;
  user: InstantTradesUser;
  from_token: InstantTradesTokenApi;
  to_token: InstantTradesTokenApi;
  from_amount: string;
  to_amount: string;
  gas_price: string;
  gas_limit: string;
  status: string;
  status_udated_at: string;
}
