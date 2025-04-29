use aiken/collection/dict
use cardano/assets.{AssetName, PolicyId, Value}

/// Gets all tokens associated with the given Policy ID
/// and returns a list of pair.
pub fn to_pairs(value: Value, policy_id: PolicyId) -> Pairs<AssetName, Int> {
  value
    |> assets.tokens(policy_id)
    |> dict.to_pairs
}
