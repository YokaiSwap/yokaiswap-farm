# YokaiSwap Farming

## Local Development

The following assumes the use of `node@>=14`.

### Install Dependencies

```
yarn install
```

### Compile Contracts

```sh
yarn compile
```

## Deployment

### Prerequisites

You need to deploy [YokaiSwap Core](https://github.com/YokaiSwap/yokaiswap-core) frist.

### Setup

Create a `.env` file, remember to replace placeholders with real value.

```sh
cat > .env <<EOF
DEPLOYER_PRIVATE_KEY=< replace with your private key >
RPC_URL=< polyjuice web3 rpc >
NETWORK_SUFFIX=< gw-testnet or gw-mainnet >

ROLLUP_TYPE_HASH=< replace with godwoken rollup type hash >
ETH_ACCOUNT_LOCK_CODE_HASH=< replace with godwoken eth-account-lock code hash >

FACTORY_ADDRESS=< replace with deployed yokai factory contract address >
EOF
```

### Deploy

Then compile and deploy.

```sh
yarn compile
yarn deploy
```

---

forked from [pancakeswap/pancake-farm](https://github.com/pancakeswap/pancake-farm)
