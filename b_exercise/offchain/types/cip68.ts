import { Constr, Data } from "@lucid-evolution/lucid";

export const RedeemerAction = {
  Mint: Data.to(new Constr(0, [])),
  Update: Data.to(new Constr(1, [])),
  Burn: Data.to(new Constr(2, [])),
};
