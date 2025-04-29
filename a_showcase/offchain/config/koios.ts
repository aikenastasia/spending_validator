import { ScriptHash } from "@lucid-evolution/lucid";

export async function getScriptFrom(hash: ScriptHash) {
  const scriptInfo = await fetch("/koios/script_info?select=bytes", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ _script_hashes: [hash] }),
  });
  const [{ bytes }] = await scriptInfo.json();

  return bytes;
}
