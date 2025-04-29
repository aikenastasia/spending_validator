import { Accordion, AccordionItem } from "@heroui/accordion";
import {
  Address,
  applyParamsToScript,
  Constr,
  Data,
  fromText,
  getAddressDetails,
  Lovelace,
  MintingPolicy,
  mintingPolicyToId,
  paymentCredentialOf,
  SpendingValidator,
  toUnit,
  TxSignBuilder,
  validatorToAddress,
} from "@lucid-evolution/lucid";

import * as Koios from "@/config/koios";
import { network, provider } from "@/config/lucid";
import { Script } from "@/config/script";
import { ActionGroup } from "@/types/action";
import { RedeemerAction } from "@/types/cip68";
import { useWallet } from "@/components/connection/context";
import Admin from "@/components/actions/Admin";
import Cip68 from "@/components/actions/Cip68";

export default function Dashboard(props: { setActionResult: (result: string) => void; onError: (error: any) => void }) {
  const [connection] = useWallet();

  if (!connection) return <span className="uppercase">Wallet Disconnected</span>;

  const { api, lucid, address, pkh } = connection;

  async function submitTx(tx: TxSignBuilder) {
    const txSigned = await tx.sign.withWallet().complete();
    const txHash = await txSigned.submit();

    return txHash;
  }

  const actions: Record<string, ActionGroup> = {
    Admin: {
      lock: async ({ lovelace, beneficiaryAddress }: { lovelace: Lovelace; beneficiaryAddress: Address }) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const spendingScript = applyParamsToScript(Script.Admin, [pkh]);
          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: spendingScript };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const beneficiary = `${getAddressDetails(beneficiaryAddress).paymentCredential?.hash}`;
          const datum = Data.to(beneficiary);

          const tx = await lucid
            .newTx()
            .pay.ToContract(validatorAddress, { kind: "inline", value: datum }, { lovelace })
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },

      unlock: async (senderAddress: Address) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const senderPKH = paymentCredentialOf(senderAddress).hash;

          const spendingScript = applyParamsToScript(Script.Admin, [senderPKH]);
          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: spendingScript };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const utxos = (await lucid.utxosAt(validatorAddress)).filter(
            ({ datum, scriptRef }) => !scriptRef && datum && `${Data.from(datum, Data.Bytes())}` === pkh,
          );

          const redeemer = Data.void();

          const tx = await lucid
            .newTx()
            .collectFrom(utxos, redeemer)
            .attach.SpendingValidator(spendingValidator)
            .addSigner(address)
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },
    },

    Cip68: {
      mint: async (nft: { name: string; image: string }) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          if (nft.name.length > 32 - 4) throw "NFT Name is too long!";
          if (nft.image.length > 64) throw "NFT Image URL is too long!";

          const metadata = Data.fromJson(nft);
          const version = BigInt(1);
          const extra: Data[] = [];
          const cip68 = new Constr(0, [metadata, version, extra]);

          const datum = Data.to(cip68);
          const redeemer = RedeemerAction.Mint;

          const utxos = await lucid.wallet().getUtxos();

          if (!utxos) throw "Empty user wallet!";

          const nonce = utxos[0];
          const { txHash, outputIndex } = nonce;

          const oRef = new Constr(0, [String(txHash), BigInt(outputIndex)]);
          const cip68script = applyParamsToScript(Script.Cip68, [oRef]);

          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: cip68script };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const mintingPolicy: MintingPolicy = { type: "PlutusV3", script: cip68script };
          const policyID = mintingPolicyToId(mintingPolicy);

          const assetName = fromText(nft.name);

          const refUnit = toUnit(policyID, assetName, 100);
          const nftUnit = toUnit(policyID, assetName, 222);

          //#region Validate Minting
          const refTokenUTXOs = await lucid.utxosAtWithUnit(validatorAddress, refUnit);

          if (refTokenUTXOs.length) throw "Must NOT Mint more than 1 NFT";
          //#endregion

          const tx = await lucid
            .newTx()
            .collectFrom([nonce])
            .mintAssets(
              {
                [refUnit]: 1n,
                [nftUnit]: 1n,
              },
              redeemer,
            )
            .attach.MintingPolicy(mintingPolicy)
            .pay.ToContract(
              validatorAddress,
              { kind: "inline", value: datum },
              {
                [refUnit]: 1n,
              },
            )
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx)
            .then((result) => {
              localStorage.setItem("spend_exercise.cip68_policyid", policyID);
              localStorage.setItem("spend_exercise.cip68_assetname", assetName);
              props.setActionResult(result);
            })
            .catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },

      update: async (nft: { name: string; image: string }) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          if (nft.name.length > 32 - 4) throw "NFT Name is too long!";
          if (nft.image.length > 64) throw "NFT Image URL is too long!";

          const metadata = Data.fromJson(nft);
          const version = BigInt(1);
          const extra: Data[] = [];
          const cip68 = new Constr(0, [metadata, version, extra]);

          const datum = Data.to(cip68);
          const redeemer = RedeemerAction.Update;

          const policyID = localStorage.getItem("spend_exercise.cip68_policyid");
          const assetName = localStorage.getItem("spend_exercise.cip68_assetname");

          if (!policyID || !assetName) throw "Found no CIP-68 data in the current session. Must mint first!";

          const refUnit = toUnit(policyID, assetName, 100);
          const nftUnit = toUnit(policyID, assetName, 222);

          const refTokenUTxO = await provider.getUtxoByUnit(`${refUnit}`);
          const usrTokenUTxO = await provider.getUtxoByUnit(`${nftUnit}`);

          const cip68script: MintingPolicy = { type: "PlutusV3", script: await Koios.getScriptFrom(policyID) };

          const tx = await lucid
            .newTx()
            .collectFrom([refTokenUTxO, usrTokenUTxO], redeemer)
            .attach.SpendingValidator(cip68script)
            .pay.ToContract(refTokenUTxO.address, { kind: "inline", value: datum }, refTokenUTxO.assets)
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },

      burn: async () => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const redeemer = RedeemerAction.Burn;

          const policyID = localStorage.getItem("spend_exercise.cip68_policyid");
          const assetName = localStorage.getItem("spend_exercise.cip68_assetname");

          if (!policyID || !assetName) throw "Found no CIP-68 data in the current session. Must mint first!";

          const refUnit = toUnit(policyID, assetName, 100);
          const nftUnit = toUnit(policyID, assetName, 222);

          const refTokenUTxO = await provider.getUtxoByUnit(refUnit);
          const usrTokenUTxO = await provider.getUtxoByUnit(nftUnit);

          const cip68script: MintingPolicy = { type: "PlutusV3", script: await Koios.getScriptFrom(policyID) };

          const tx = await lucid
            .newTx()
            .collectFrom([refTokenUTxO, usrTokenUTxO], redeemer)
            .attach.SpendingValidator(cip68script)
            .mintAssets(
              {
                [refUnit]: -1n,
                [nftUnit]: -1n,
              },
              redeemer,
            )
            .attach.MintingPolicy(cip68script)
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx)
            .then((result) => {
              localStorage.removeItem("spend_exercise.cip68_policyid");
              localStorage.removeItem("spend_exercise.cip68_assetname");
              props.setActionResult(result);
            })
            .catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },
    },
  };

  return (
    <div className="flex flex-col gap-2">
      <span>{address}</span>

      <Accordion variant="splitted">
        {/* Admin */}
        <AccordionItem key="3" aria-label="Accordion 1" title="Admin">
          <Admin onLock={actions.Admin.lock} onUnlock={actions.Admin.unlock} />
        </AccordionItem>

        {/* CIP-68 */}
        <AccordionItem key="5" aria-label="Accordion 2" title="CIP-68">
          <Cip68 onBurn={actions.Cip68.burn} onMint={actions.Cip68.mint} onUpdate={actions.Cip68.update} />
        </AccordionItem>
      </Accordion>
    </div>
  );
}
