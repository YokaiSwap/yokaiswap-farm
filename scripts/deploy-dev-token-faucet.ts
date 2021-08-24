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

import Faucet from "../artifacts/contracts/dev/Faucet.sol/Faucet.json";
import MintableToken from "../artifacts/contracts/dev/MintableToken.sol/MintableToken.json";

import { tokens, yokContractName } from "./config";

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
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
  approve(
    spender: string,
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

interface IFaucet extends Contract {
  mint(
    tokens: string[],
    amount: BigNumberish,
    overrides?: Overrides,
  ): Promise<TransactionResponse>;
}

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

  const [yokAndMonsterTxReceipts, tokensTxReceipts, transactionSubmitter] =
    await Promise.all([
      TransactionSubmitter.loadReceipts(
        `deploy-yok-and-monster${
          networkSuffix ? `-${networkSuffix}` : ""
        }.json`,
      ),
      TransactionSubmitter.loadReceipts(
        `deploy-dev-tokens${networkSuffix ? `-${networkSuffix}` : ""}.json`,
      ),
      TransactionSubmitter.newWithHistory(
        `deploy-dev-token-faucet${
          networkSuffix ? `-${networkSuffix}` : ""
        }.json`,
        Boolean(process.env.IGNORE_HISTORY),
      ),
    ]);

  const yokTxReceipt = yokAndMonsterTxReceipts[`Deploy ${yokContractName}`];
  if (yokTxReceipt == null) {
    throw new Error("Failed to get YOK address");
  }
  const yokAddress = yokTxReceipt.contractAddress;

  let receipt = await transactionSubmitter.submitAndWait(
    `Deploy Faucet`,
    () => {
      const implementationFactory = new ContractFactory(
        Faucet.abi,
        Faucet.bytecode,
        deployer,
      );
      const tx = implementationFactory.getDeployTransaction(yokAddress);
      tx.gasPrice = txOverrides.gasPrice;
      tx.gasLimit = txOverrides.gasLimit;
      return deployer.sendTransaction(tx);
    },
  );

  const faucetAddress = receipt.contractAddress;
  console.log("    Faucet address:", faucetAddress);

  const tokenSymbols = Object.keys(tokens);
  const tokenContracts = tokenSymbols.map((tokenSymbol) => {
    const receipt = tokensTxReceipts[`Deploy ${tokenSymbol}`];
    if (receipt == null) {
      throw new Error(`Failed to get ${tokenSymbol} address`);
    }

    return new Contract(
      receipt.contractAddress,
      MintableToken.abi,
      deployer,
    ) as IMintableToken;
  });

  for (const [index, token] of tokenContracts.entries()) {
    await transactionSubmitter.submitAndWait(
      `Set faucet as minter for ${tokenSymbols[index]}`,
      () => token.setMinter(faucetAddress, txOverrides),
    );
  }

  const yok = new Contract(
    yokAddress,
    MintableToken.abi,
    deployer,
  ) as IMintableToken;

  await transactionSubmitter.submitAndWait(`Set faucet as minter for YOK`, () =>
    yok.setMinter(faucetAddress, txOverrides),
  );

  const faucet = new Contract(faucetAddress, Faucet.abi, deployer) as IFaucet;

  await transactionSubmitter.submitAndWait(
    `Mint 100,000 ${tokenSymbols.join(", ")}, and YOK`,
    () =>
      faucet.mint(
        tokenContracts.map((token) => token.address).concat(yokAddress),
        unit(100_000),
        txOverrides,
      ),
  );

  console.log(
    `Balances(${tokenSymbols.join(", ")}, YOK):`,
    (
      await Promise.all(
        tokenContracts
          .concat(yok)
          .map((token) => token.callStatic.balanceOf(deployerRecipientAddress)),
      )
    )
      .map((bn) => bn.div(constants.WeiPerEther.div(1e9)).toNumber() / 1e9)
      .join(", "),
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
