/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/webgold.json`.
 */
export type Webgold = {
  "address": "3siGeKgHp7pvVVmjbdtBemeirNRPSFHyMXBJu3CXZ3hX",
  "metadata": {
    "name": "webgold",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Webgold — the rule and the record. Holds policy and receipts, never a book."
  },
  "docs": [
    "# Webgold — the rule and the record",
    "",
    "THE PROGRAM IS NEVER THE VAULT.",
    "",
    "Two rules that do not bend, and every instruction added here is measured against them:",
    "",
    "1. **Assets are held only while they are under a rule.** An escrowed payout on its way to a",
    "recipient, and nothing else. A settled position sits in the recipient's OWN token",
    "account. A pooled claim on a basket of tokenized securities would make this a fund;",
    "direct ownership does not, and that distinction is load-bearing.",
    "",
    "2. **The program never decides who deserves money, and never picks an asset.** A payout",
    "carries a payer, recipients, a dollar value, a reason string and an optional constraint",
    "on the asset SET. Verification happens somewhere else, or nowhere. The recipient's own",
    "signed policy decides what the value becomes — weights come from that policy, prices",
    "from Pyth, routing from Jupiter. Software executes a rule here; it never exercises",
    "discretion over someone's money.",
    "",
    "Accounts and instructions arrive in dependency order (see docs/build-order.md): the book",
    "and its policy first, then funded and released payouts with their receipts, then named",
    "sends, sponsorships and goal vaults."
  ],
  "instructions": [
    {
      "name": "ping",
      "docs": [
        "A build-order placeholder so the workspace compiles and the IDL is real from day one.",
        "Replaced by  at build-order step 2."
      ],
      "discriminator": [
        173,
        0,
        94,
        236,
        73,
        133,
        225,
        153
      ],
      "accounts": [],
      "args": []
    }
  ]
};
