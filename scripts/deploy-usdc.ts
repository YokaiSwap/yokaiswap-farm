import {
  BigNumber,
  BigNumberish,
  CallOverrides,
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

import SUDTERC20Proxy from "../generated-artifacts/contracts/SudtERC20Proxy.json";

type TCallStatic = Contract["callStatic"];
type TransactionResponse = providers.TransactionResponse;

interface IERC20StaticMethods extends TCallStatic {
  totalSupply(overrides?: CallOverrides): Promise<BigNumber>;
  balanceOf(account: string, overrides?: CallOverrides): Promise<BigNumber>;
}

interface IERC20 extends Contract, IERC20StaticMethods {
  callStatic: IERC20StaticMethods;
  transfer(
    recipient: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

const deployerAddress = deployer.address;

const txOverrides = {
  gasPrice: isGodwoken ? 0 : undefined,
  gasLimit: isGodwoken ? 12_500_000 : undefined,
};

const { USDC_SUDT_ID } = process.env;
if (USDC_SUDT_ID == null) {
  console.log("process.env.USDC_SUDT_ID is required");
  process.exit(1);
}
const usdcSUDTID = USDC_SUDT_ID;

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

  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `deploy-usdc${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

  let receipt = await transactionSubmitter.submitAndWait(`Deploy USDC`, () => {
    const implementationFactory = new ContractFactory(
      SUDTERC20Proxy.abi,
      SUDTERC20Proxy.bytecode,
      deployer,
    );
    const tx = implementationFactory.getDeployTransaction(
      "Nervos-Peg USD Coin",
      "USDC",
      unit(100_000_000),
      usdcSUDTID,
    );
    tx.gasPrice = txOverrides.gasPrice;
    tx.gasLimit = txOverrides.gasLimit;
    return deployer.sendTransaction(tx);
  });

  const usdcAddress = receipt.contractAddress;
  console.log(`    USDC address:`, usdcAddress);

  const usdc = new Contract(
    usdcAddress,
    SUDTERC20Proxy.abi,
    deployer,
  ) as IERC20;

  console.log(
    "Total supply:",
    (await usdc.callStatic.totalSupply()).toString(),
  );

  console.log(
    "Balance:",
    (await usdc.callStatic.balanceOf(deployerRecipientAddress)).toString(),
  );

  // if (isGodwoken) {
  //   const { godwoker } = rpc as PolyjuiceJsonRpcProvider;
  //   const holderWallet = new PolyjuiceWallet(
  //     "0x7a91648d4afa95fa78bb46a20711b6536d2569530260a1f786176a786e81fdfa",
  //     polyjuiceConfig,
  //     polyjuiceRPC,
  //   )
  //   const usdcForHolder = new Contract(
  //     usdcAddress,
  //     SUDTERC20Proxy.abi,
  //     holderWallet,
  //   ) as IERC20;

  //   const holder = await godwoker.getShortAddressByAllTypeEthAddress("0x23333496565720D945784a35aA655471493C0641");

  //   console.log(
  //     "Holder Balance:",
  //     (
  //       await usdc.callStatic.balanceOf(holder)
  //     ).toString(),
  //   );

  //   const to = await godwoker.getShortAddressByAllTypeEthAddress("0x233330542004C5405Bcee19D4cFba91b66b4807A");
  //   console.log(
  //     "Balance:",
  //     (
  //       await usdc.callStatic.balanceOf(to)
  //     ).toString(),
  //   );

  //   await transactionSubmitter.submitAndWait("Transfer 100 USDC", () => usdcForHolder.transfer(to, unit(100), txOverrides))

  //   console.log(
  //     "Holder Balance:",
  //     (
  //       await usdc.callStatic.balanceOf(holder)
  //     ).toString(),
  //   );

  //   console.log(
  //     "Balance:",
  //     (
  //       await usdc.callStatic.balanceOf(to)
  //     ).toString(),
  //   );
  // }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.log("err", err);
    process.exit(1);
  });
