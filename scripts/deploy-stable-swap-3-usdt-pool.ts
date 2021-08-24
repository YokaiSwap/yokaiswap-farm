import {
  BigNumber,
  BigNumberish,
  CallOverrides,
  constants,
  Contract,
  ContractFactory,
  Overrides,
  providers,
} from "ethers";
import { PolyjuiceJsonRpcProvider } from "@polyjuice-provider/ethers";

import {
  deployer,
  initGWAccountIfNeeded,
  isGodwoken,
  networkSuffix,
  rpc,
  unit,
} from "./common";

import { TransactionSubmitter } from "./TransactionSubmitter";

import CurveTokenV3 from "../generated-artifacts/contracts/CurveTokenV3.json";
import StableSwap3USDTPool from "../generated-artifacts/contracts/StableSwap3USDTPool.json";

import Faucet from "../artifacts/contracts/dev/Faucet.sol/Faucet.json";
import MintableToken from "../artifacts/contracts/dev/MintableToken.sol/MintableToken.json";

type TCallStatic = Contract["callStatic"];
type TransactionResponse = providers.TransactionResponse;

interface IMintableTokenStaticMethods extends TCallStatic {
  totalSupply(overrides?: CallOverrides): Promise<BigNumber>;
  balanceOf(account: string, overrides?: CallOverrides): Promise<BigNumber>;
  minter(): Promise<string>;
}

interface IMintableToken extends Contract, IMintableTokenStaticMethods {
  callStatic: IMintableTokenStaticMethods;
  setMinter(
    minter: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  mint(
    recipient: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  approve(
    spender: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

interface ICurveTokenV3 extends Contract, IMintableTokenStaticMethods {
  callStatic: IMintableTokenStaticMethods;
  set_minter(
    minter: string,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  mint(
    recipient: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

interface ISwapStaticMethods extends TCallStatic {
  coins(index: number, overrides?: CallOverrides): Promise<string>;
  balances(index: number, overrides?: CallOverrides): Promise<BigNumber>;
  calc_token_amount(
    amounts: BigNumberish[],
    deposit: boolean,
    overrides?: CallOverrides,
  ): Promise<BigNumber>;
}

interface ISwap extends Contract, ISwapStaticMethods {
  callStatic: ISwapStaticMethods;
  add_liquidity(
    amounts: BigNumberish[],
    min_mint_amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  exchange(
    input_token_index: number,
    output_token_index: number,
    input_amount: BigNumberish,
    min_output_amount: BigNumberish,
  ): Promise<TransactionResponse>;
}

interface IFaucet extends Contract {
  mint(
    tokens: string[],
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

const { MaxUint256 } = constants;

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 12_500_000 : undefined,
};

async function main() {
  console.log("Deployer address", deployerAddress);

  await initGWAccountIfNeeded(deployerAddress);

  let deployerRecipientAddress = deployerAddress;
  if (isGodwoken) {
    const { godwoker } = rpc as PolyjuiceJsonRpcProvider;
    deployerRecipientAddress =
      await godwoker.getShortAddressByAllTypeEthAddress(deployerAddress);
    console.log("Deployer godwoken address:", deployerRecipientAddress);
  }

  const [tokensTxReceipts, faucetTxReceipts, transactionSubmitter] =
    await Promise.all([
      TransactionSubmitter.loadReceipts(
        `deploy-dev-tokens${networkSuffix ? `-${networkSuffix}` : ""}.json`,
      ),
      TransactionSubmitter.loadReceipts(
        `deploy-dev-token-faucet${
          networkSuffix ? `-${networkSuffix}` : ""
        }.json`,
      ),
      TransactionSubmitter.newWithHistory(
        `deploy-stable-swap-3-usdt-pool${
          networkSuffix ? `-${networkSuffix}` : ""
        }.json`,
        Boolean(process.env.IGNORE_HISTORY),
      ),
    ]);

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy y3USDT`,
    () => {
      const implementationFactory = new ContractFactory(
        CurveTokenV3.abi,
        CurveTokenV3.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        "YokaiSwap 3USDT",
        "y3USDT",
      );
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const y3USDTAddress = receipt.contractAddress;
  console.log(`    y3USDT address:`, y3USDTAddress);
  const y3USDT = new Contract(
    y3USDTAddress,
    CurveTokenV3.abi,
    deployer,
  ) as ICurveTokenV3;

  const [usdtTxReceipt, ethUSDTTxReceipt, solUSDTTxReceipt, faucetTxReceipt] = [
    tokensTxReceipts["Deploy USDT"],
    tokensTxReceipts["Deploy ethUSDT"],
    tokensTxReceipts["Deploy solUSDT"],
    faucetTxReceipts["Deploy Faucet"],
  ];
  if (usdtTxReceipt == null) {
    throw new Error("Failed to get USDT address");
  }
  if (ethUSDTTxReceipt == null) {
    throw new Error("Failed to get ethUSDT address");
  }
  if (solUSDTTxReceipt == null) {
    throw new Error("Failed to get solUSDT address");
  }
  if (faucetTxReceipt == null) {
    throw new Error("Failed to get Faucet address");
  }
  const usdtAddress = usdtTxReceipt.contractAddress;
  const ethUSDTAddress = ethUSDTTxReceipt.contractAddress;
  const solUSDTAddress = solUSDTTxReceipt.contractAddress;
  const faucetAddress = faucetTxReceipt.contractAddress;

  receipt = await transactionSubmitter.submitAndWait(
    `Deploy StableSwap3USDTPool`,
    () => {
      const implementationFactory = new ContractFactory(
        StableSwap3USDTPool.abi,
        StableSwap3USDTPool.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(
        deployerRecipientAddress,
        [usdtAddress, ethUSDTAddress, solUSDTAddress],
        y3USDTAddress,
        200,
        4000000,
        0,
      );
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const swapAddress = receipt.contractAddress;
  console.log(`    StableSwap3USDTPool address:`, swapAddress);

  await transactionSubmitter.submitAndWait(
    `Set y3USDT minter to StableSwap3USDTPool`,
    () => y3USDT.set_minter(swapAddress, txOverrides),
  );

  console.log("    Minter:", await y3USDT.callStatic.minter());

  const [usdt, ethUSDT, solUSDT, faucet, swap] = [
    new Contract(usdtAddress, MintableToken.abi, deployer) as IMintableToken,
    new Contract(ethUSDTAddress, MintableToken.abi, deployer) as IMintableToken,
    new Contract(solUSDTAddress, MintableToken.abi, deployer) as IMintableToken,
    new Contract(faucetAddress, Faucet.abi, deployer) as IFaucet,
    new Contract(swapAddress, StableSwap3USDTPool.abi, deployer) as ISwap,
  ];

  await transactionSubmitter.submitAndWait(
    "Mint 100,000 USDT, ethUSDT and solUSDT",
    () =>
      faucet.mint(
        [usdtAddress, ethUSDTAddress, solUSDTAddress],
        unit(100_000),
        txOverrides,
      ),
  );

  console.log(
    "Balances(USDT, ethUSDT, solUSDT):",
    (
      await Promise.all([
        usdt.balanceOf(deployerRecipientAddress),
        ethUSDT.balanceOf(deployerRecipientAddress),
        solUSDT.balanceOf(deployerRecipientAddress),
      ])
    )
      .map((bn) => bn.div(constants.WeiPerEther.div(1e9)).toNumber() / 1e9)
      .join(", "),
  );

  console.log(
    await Promise.all([
      swap.callStatic.coins(0),
      swap.callStatic.coins(1),
      swap.callStatic.coins(2),
    ]),
  );

  console.log(
    (
      await Promise.all([
        swap.callStatic.balances(0),
        swap.callStatic.balances(1),
        swap.callStatic.balances(2),
      ])
    ).map((bn) => bn.div(constants.WeiPerEther.div(1e9)).toNumber() / 1e9),
  );

  await transactionSubmitter.submitAndWait("Approve USDT", () =>
    usdt.approve(swapAddress, MaxUint256, txOverrides),
  );

  await transactionSubmitter.submitAndWait("Approve ethUSDT", () =>
    ethUSDT.approve(swapAddress, MaxUint256, txOverrides),
  );

  await transactionSubmitter.submitAndWait("Approve solUSDT", () =>
    solUSDT.approve(swapAddress, MaxUint256, txOverrides),
  );

  await transactionSubmitter.submitAndWait("Add 100,000 liquidity", () =>
    swap.add_liquidity(
      [unit(100_000), unit(100_000), unit(100_000)],
      0,
      txOverrides,
    ),
  );

  console.log(
    (
      await Promise.all([
        swap.callStatic.balances(0),
        swap.callStatic.balances(1),
        swap.callStatic.balances(2),
      ])
    ).map((bn) => bn.div(constants.WeiPerEther.div(1e9)).toNumber() / 1e9),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
