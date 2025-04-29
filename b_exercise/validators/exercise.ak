use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/option
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Input, OutputReference, Transaction}
use exercise/types/action.{Action, Burn, Mint, Update}
use exercise/types/cip68.{Cip68}
use exercise/utils/value

validator admin(pkh: VerificationKeyHash) {
  spend(
    datum: Option<VerificationKeyHash>,
    _redeemer: Void,
    _o_ref: OutputReference,
    tx: Transaction,
  ) {
    todo @"the Transaction must be signed by `pkh` when there's no datum, otherwise it must be signed by datum VerificationKeyHash"
  }

  else(_) {
    fail
  }
}

/// Modify this cip_68 validator so that it will only allow NFT Minting
/// (NFT Asset label is 000de140 according to the CIP-68 specifications)
///
/// Enforce uniqueness using the "One-shot" Minting policies concept
/// (see: https://aiken-lang.org/fundamentals/common-design-patterns#one-shot-minting-policies)
///
/// Also, add an action to allow burning (negative value minting quantity)
/// by burning both the reference token and the user token at the same transaction.
///
/// You can use the provided offchain to play around with this,
/// and to see how the interactions work from the offchain side.
validator cip_68 {
  mint(_redeemer: Void, policy_id: PolicyId, tx: Transaction) {
    // must mint exactly 2 tokens: ref_token & usr_token
    expect [ref_token, usr_token] = tx.mint |> value.to_pairs(policy_id)

    // must mint 1 ref_token, labelled:000643b0
    expect Pair(ref_token_name, 1) = ref_token
    expect #"000643b0" = ref_token_name |> bytearray.take(4)

    // must send ref_token to self_script with CIP-68 inline datum
    expect [ref_token_utxo] =
      tx.outputs |> transaction.find_script_outputs(policy_id)
    expect InlineDatum(metadata) = ref_token_utxo.datum
    expect _: Cip68 = metadata
    expect 1 =
      ref_token_utxo.value |> assets.quantity_of(policy_id, ref_token_name)

    // must mint usr_token with the same name as the ref_token
    let Pair(usr_token_name, _) = usr_token
    bytearray.drop(usr_token_name, 4) == bytearray.drop(ref_token_name, 4)
  }

  spend(
    _datum: Option<Cip68>,
    _redeemer: Void,
    o_ref: OutputReference,
    tx: Transaction,
  ) {
    // must consume usr_token to proof ownership
    expect Some(input) = tx.inputs |> transaction.find_input(o_ref)
    expect Script(policy_id) = input.output.address.payment_credential
    expect [Pair(ref_token_name, _)] =
      // extract the input ref_token AssetName by self PolicyID
      input.output.value |> value.to_pairs(policy_id)
    let token_name = ref_token_name |> bytearray.drop(4)
    expect {
      let input <- list.any(tx.inputs)
      let tokens = input.output.value |> value.to_pairs(policy_id)
      let Pair(asset_name, _) <- list.any(tokens)
      and {
        asset_name != ref_token_name,
        bytearray.drop(asset_name, 4) == token_name,
      }
    }

    // must resend ref_token to update the metadatum
    expect [output] = tx.outputs |> transaction.find_script_outputs(policy_id)
    expect InlineDatum(metadata) = output.datum
    expect _: Cip68 = metadata
    expect [Pair(o_ref_token_name, _)] =
      // extract the output ref_token AssetName by self PolicyID
      output.value |> value.to_pairs(policy_id)
    and {
      o_ref_token_name == ref_token_name,
      // ☝🏻must resend ref_token with the same AssetName

      output.address == input.output.address,
      // ☝🏻prevent insufficient-staking-control vulnerability:
      // https://library.mlabs.city/common-plutus-security-vulnerabilities#11.insufficientstakingkeycontrol

      output.reference_script == input.output.reference_script,
    }
  }

  else(_) {
    fail
  }
}
