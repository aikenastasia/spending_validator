import { createHash } from "crypto";

import { blake2bHex } from "blakejs";
import { Accordion, AccordionItem } from "@heroui/accordion";
import {
  Address,
  applyParamsToScript,
  Constr,
  Data,
  fromHex,
  fromText,
  Lovelace,
  MintingPolicy,
  mintingPolicyToId,
  SpendingValidator,
  toUnit,
  TxBuilder,
  TxSignBuilder,
  Validator,
  validatorToAddress,
} from "@lucid-evolution/lucid";

import { network } from "@/config/lucid";
import { Script } from "@/config/script";
import { ActionGroup } from "@/types/action";
import { useWallet } from "@/components/connection/context";
import BasicTransfer from "@/components/actions/0_BasicTransfer";
import CheckDatum from "@/components/actions/A_CheckDatum";
import CheckRedeemer from "@/components/actions/B_CheckRedeemer";
import ScWallet from "@/components/actions/C_ScWallet";
import Receipts from "@/components/actions/D_Receipts";
import Cip68 from "@/components/actions/E_Cip68";

export default function Dashboard(props: { setActionResult: (result: string) => void; onError: (error: any) => void }) {
  const [connection] = useWallet();

  if (!connection) return <span className="uppercase">Wallet Disconnected</span>;

  const { api, lucid, address, pkh } = connection;

  async function submitTx(tx: TxSignBuilder) {
    const txSigned = await tx.sign.withWallet().complete();
    const txHash = await txSigned.submit();

    return txHash;
  }

  /** A helper function to split an output into multiple outputs.
   * @param txBuilder
   * @param contractAddress
   * @param inlineDatum
   * @param lovelace
   * @param splitCount
   * @returns Transaction builder
   */
  function splitOutputs(txBuilder: TxBuilder, contractAddress: Address, inlineDatum: string, lovelace: Lovelace, splitCount: number) {
    const minAmount = 2_000000n;
    let splitAmount = lovelace / BigInt(splitCount);

    if (splitAmount < minAmount) splitAmount = minAmount;

    while (lovelace > splitAmount) {
      txBuilder = txBuilder.pay.ToContract(contractAddress, { kind: "inline", value: inlineDatum }, { lovelace: splitAmount });
      lovelace -= splitAmount;
    }

    txBuilder = txBuilder.pay.ToContract(contractAddress, { kind: "inline", value: inlineDatum }, { lovelace });

    return txBuilder;
  }

  const actions: Record<string, ActionGroup> = {
    //#region No smart-contract interaction
    BasicTransaction: {
      transfer: async ({ toAddress, lovelace }: { toAddress: Address; lovelace: Lovelace }) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const tx = await lucid
            .newTx()
            .pay.ToAddress(toAddress, { lovelace })
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },
    },
    //#endregion

    //#region Smart-contract interactions
    CheckDatum: {
      lock: async (lovelace: Lovelace) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: Script.SpendCheckDatum };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const datum = Data.to(42n);

          let newTx = lucid.newTx();

          newTx = splitOutputs(newTx, validatorAddress, datum, lovelace, 100);

          const tx = await newTx
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },

      unlock: async () => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: Script.SpendCheckDatum };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const utxos = await lucid.utxosAt(validatorAddress);
          const redeemer = Data.void();

          const tx = await lucid
            .newTx()
            .collectFrom(utxos, redeemer)
            .attach.SpendingValidator(spendingValidator)
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },
    },

    CheckRedeemer: {
      lock: async ({ lovelace, secret }: { lovelace: Lovelace; secret: string }) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: Script.SpendCheckRedeemer };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const hash = createHash("sha256").update(secret, "utf8").digest("hex");
          const datum = Data.to(hash);

          let newTx = lucid.newTx();

          newTx = splitOutputs(newTx, validatorAddress, datum, lovelace, 75);

          const tx = await newTx
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },

      unlock: async (secret: string) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: Script.SpendCheckRedeemer };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const hash = createHash("sha256").update(secret, "utf8").digest("hex");
          const utxos = (await lucid.utxosAt(validatorAddress)).filter(({ datum }) => datum && `${Data.from(datum, Data.Bytes())}` === hash);

          const hex = fromText(secret);
          const redeemer = Data.to(hex);

          const tx = await lucid
            .newTx()
            .collectFrom(utxos, redeemer)
            .attach.SpendingValidator(spendingValidator)
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },
    },

    ScWallet: {
      lock: async (lovelace: Lovelace) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const spendingScript = applyParamsToScript(Script.SpendScWallet, [pkh]);
          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: spendingScript };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const datum = Data.void();

          let newTx = lucid.newTx();

          newTx = splitOutputs(newTx, validatorAddress, datum, lovelace, 50);

          const tx = await newTx
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },

      unlock: async () => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const spendingScript = applyParamsToScript(Script.SpendScWallet, [pkh]);
          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: spendingScript };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const utxos = await lucid.utxosAt(validatorAddress);
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

    Receipts: {
      lock: async (lovelace: Lovelace) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const receiptScript = applyParamsToScript(Script.Receipts, [pkh]);
          const receiptValidator: SpendingValidator = { type: "PlutusV3", script: receiptScript };

          const validatorAddress = validatorToAddress(network, receiptValidator);

          const datum = Data.void();

          let newTx = lucid.newTx();

          newTx = splitOutputs(newTx, validatorAddress, datum, lovelace, 25);

          const tx = await newTx
            .validTo(new Date().getTime() + 15 * 60_000) // ~15 minutes
            .complete();

          submitTx(tx).then(props.setActionResult).catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },

      unlock: async () => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          const receiptScript = applyParamsToScript(Script.Receipts, [pkh]);
          const receiptValidator: Validator = { type: "PlutusV3", script: receiptScript };

          const validatorAddress = validatorToAddress(network, receiptValidator);
          const policyID = mintingPolicyToId(receiptValidator);

          const utxos = await lucid.utxosAt(validatorAddress);
          const redeemer = Data.void();

          const oRefs = utxos.map(({ txHash, outputIndex }) => {
            return new Constr(0, [String(txHash), BigInt(outputIndex)]);
          });
          const oRefsCBOR = Data.to(oRefs);

          const assetName = blake2bHex(fromHex(oRefsCBOR), undefined, 32);
          const mintedAssets = { [`${policyID}${assetName}`]: 1n };

          const tx = await lucid
            .newTx()
            .collectFrom(utxos, redeemer)
            .attach.SpendingValidator(receiptValidator)
            .mintAssets(mintedAssets, redeemer)
            .attach.MintingPolicy(receiptValidator)
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
      mint: async ({ name, image, label, qty }: { name: string; image: string; label: 222 | 333 | 444; qty: number }) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          if (name.length > 32 - 4) throw "Asset Name is too long!";
          if (image.length > 64) throw "Asset Image URL is too long!";

          const metadata = Data.fromJson({ name, image });
          const version = BigInt(1);
          const extra: Data[] = [];
          const cip68 = new Constr(0, [metadata, version, extra]);

          const datum = Data.to(cip68);
          const redeemer = Data.void();

          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: Script.Cip68 };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const mintingPolicy: MintingPolicy = { type: "PlutusV3", script: Script.Cip68 };
          const policyID = mintingPolicyToId(mintingPolicy);

          const assetName = fromText(name);

          const refUnit = toUnit(policyID, assetName, 100);
          const usrUnit = toUnit(policyID, assetName, label);

          //   //#region Validate Minting
          //   const refTokenUTXOs = await lucid.utxosAtWithUnit(validatorAddress, refUnit);
          //   if (refTokenUTXOs.length) throw "Must NOT ReMint RefTokens";
          //   //#endregion

          const tx = await lucid
            .newTx()
            .mintAssets(
              {
                [refUnit]: 1n,
                [usrUnit]: BigInt(qty),
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
              localStorage.setItem("spend_showcase.cip68_refunit", refUnit);
              localStorage.setItem("spend_showcase.cip68_usrunit", usrUnit);
              props.setActionResult(result);
            })
            .catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },

      update: async ({ name, image }: { name: string; image: string }) => {
        try {
          if (!lucid.wallet()) lucid.selectWallet.fromAPI(api);

          if (name.length > 32 - 4) throw "Asset Name is too long!";
          if (image.length > 64) throw "Asset Image URL is too long!";

          const metadata = Data.fromJson({ name, image });
          const version = BigInt(1);
          const extra: Data[] = [];
          const cip68 = new Constr(0, [metadata, version, extra]);

          const datum = Data.to(cip68);
          const redeemer = Data.void();

          const spendingValidator: SpendingValidator = { type: "PlutusV3", script: Script.Cip68 };
          const validatorAddress = validatorToAddress(network, spendingValidator);

          const refUnit = localStorage.getItem("spend_showcase.cip68_refunit");
          const usrUnit = localStorage.getItem("spend_showcase.cip68_usrunit");

          if (!refUnit || !usrUnit) throw "Found no asset units in the current session's local storage. Must mint first!";

          const refTokenUTXOs = await lucid.utxosAtWithUnit(validatorAddress, refUnit);
          const usrTokenUTXOs = await lucid.utxosAtWithUnit(address, usrUnit);

          const tx = await lucid
            .newTx()
            .collectFrom([...refTokenUTXOs, ...usrTokenUTXOs], redeemer)
            .attach.SpendingValidator(spendingValidator)
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
              localStorage.removeItem("spend_showcase.cip68_refunit");
              localStorage.removeItem("spend_showcase.cip68_usrunit");
              props.setActionResult(result);
            })
            .catch(props.onError);
        } catch (error) {
          props.onError(error);
        }
      },
    },
    //#endregion
  };

  return (
    <div className="flex flex-col gap-2">
      <span>{address}</span>

      <Accordion variant="splitted">
        {/* No SC */}
        <AccordionItem key="0" aria-label="Accordion 0" title="Basic Transaction (no smart-contract interaction)">
          <BasicTransfer onTransfer={actions.BasicTransaction.transfer} />
        </AccordionItem>

        {/* Check Datum */}
        <AccordionItem key="1" aria-label="Accordion 1" title="Check Datum">
          <CheckDatum onLock={actions.CheckDatum.lock} onUnlock={actions.CheckDatum.unlock} />
        </AccordionItem>

        {/* Check Redeemer */}
        <AccordionItem key="2" aria-label="Accordion 2" title="Check Redeemer">
          <CheckRedeemer onLock={actions.CheckRedeemer.lock} onUnlock={actions.CheckRedeemer.unlock} />
        </AccordionItem>

        {/* SC Wallet */}
        <AccordionItem key="3" aria-label="Accordion 3" title="SC Wallet">
          <ScWallet onLock={actions.ScWallet.lock} onUnlock={actions.ScWallet.unlock} />
        </AccordionItem>

        {/* Receipts */}
        <AccordionItem key="4" aria-label="Accordion 4" title="Receipts">
          <Receipts onLock={actions.Receipts.lock} onUnlock={actions.Receipts.unlock} />
        </AccordionItem>

        {/* CIP-68 */}
        <AccordionItem key="5" aria-label="Accordion 5" title="CIP-68">
          <Cip68 onMint={actions.Cip68.mint} onUpdate={actions.Cip68.update} />
        </AccordionItem>
      </Accordion>
    </div>
  );
}
