use aiken/cbor
use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/option
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Input, OutputReference, Transaction}
use showcase/types/cip68.{Cip68}
use showcase/utils/tx
use showcase/utils/value

validator check_datum {
  spend(
    datum: Option<Int>,
    _redeemer: Void,
    _o_ref: OutputReference,
    _tx: Transaction,
  ) {
    // one way to deal with Option is by using when-is to extract its value
    when datum is {
      Some(i) -> (i == 42)?
      None -> fail @"No Datum"
    }
  }

  else(_) {
    fail
  }
}

validator check_redeemer {
  spend(
    datum: Option<ByteArray>,
    redeemer: ByteArray,
    _o_ref: OutputReference,
    _tx: Transaction,
  ) {
    // another way is by using aiken/option.{or_else} by providing a fallback/default value
    let hash = datum |> option.or_else("")
    (crypto.sha2_256(redeemer) == hash)?
  }

  else(_) {
    fail
  }
}

validator sc_wallet(pkh: VerificationKeyHash) {
  spend(
    _datum: Option<Data>,
    _redeemer: Void,
    _o_ref: OutputReference,
    tx: Transaction,
  ) {
    // allow spending whenever the transaction is signed only by the PKH as specified in the script param
    // NOTE: This is convenient, but not composable!
    ([pkh] == tx.extra_signatories)?
  }

  else(_) {
    fail
  }
}

validator receipts(pkh: VerificationKeyHash) {
  /// Receipts:
  /// https://aiken-lang.org/fundamentals/common-design-patterns#receipts
  mint(_redeemer: Void, policy_id: PolicyId, tx: Transaction) {
    // transaction level validation: conveniently checks the transaction signer, but is NOT composable!
    expect [pkh] == tx.extra_signatories

    // must spend something from the contract address
    let script_inputs_o_ref_list = {
      let input <- tx.filter_map_script_inputs(tx.inputs, policy_id)
      input.output_reference
    }
    expect [] != script_inputs_o_ref_list

    // must mint 1 receipt-NFT with the expected asset-name
    when tx.mint |> assets.tokens(policy_id) |> dict.to_pairs() is {
      [Pair(asset_name, 1)] ->
        asset_name == (
          script_inputs_o_ref_list
            |> cbor.serialise
            |> crypto.blake2b_256
        )
      _ -> fail @"Invalid Mint"
    }
  }

  /// Transaction Level Validation via Minting Policies:
  /// https://github.com/Anastasia-Labs/design-patterns/blob/main/transaction-level-validator-minting-policy/TRANSACTION-LEVEL-VALIDATION-MINTING-POLICY.md#transaction-level-validation-via-minting-policies
  spend(
    _datum: Option<Data>,
    _redeemer: Void,
    o_ref: OutputReference,
    tx: Transaction,
  ) {
    // delegate the validations to the minting script, which will only be executed once for the entire transaction
    expect Some(input) = tx.inputs |> transaction.find_input(o_ref)
    expect Script(policy_id) = input.output.address.payment_credential

    (assets.policies(tx.mint) == [policy_id])?
  }

  else(_) {
    fail
  }
}

/// CIP-68:
/// https://github.com/cardano-foundation/CIPs/tree/master/CIP-0068
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
