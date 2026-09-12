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
    "discretion over someone's money."
  ],
  "instructions": [
    {
      "name": "closeBook",
      "docs": [
        "Close a book and return its rent to the owner.",
        "",
        "Safe precisely because the program never held anything: closing a book cannot strand",
        "an asset, because the assets were never here. They are in the owner's token accounts",
        "and are untouched by this."
      ],
      "discriminator": [
        216,
        209,
        72,
        159,
        209,
        206,
        135,
        66
      ],
      "accounts": [
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "book"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "openBook",
      "docs": [
        "Open a book. One per owner, at a deterministic address anyone can derive.",
        "",
        "The book holds the signed policy and the lifetime counters. It never holds an asset,",
        "and there is no instruction here that could make it hold one."
      ],
      "discriminator": [
        179,
        61,
        78,
        135,
        182,
        178,
        205,
        97
      ],
      "accounts": [
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "policy",
          "type": {
            "defined": {
              "name": "policy"
            }
          }
        }
      ]
    },
    {
      "name": "setPolicy",
      "docs": [
        "Replace the mix policy. Only the owner may, and only with one that validates.",
        "",
        "THE POLICY IS THE ONLY PLACE A WEIGHT CAN COME FROM. There is deliberately no",
        "instruction that lets an operator, a model or this program choose a weight for",
        "somebody. That absence is the product."
      ],
      "discriminator": [
        40,
        133,
        12,
        157,
        235,
        202,
        2,
        132
      ],
      "accounts": [
        {
          "name": "book",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "book"
          ]
        }
      ],
      "args": [
        {
          "name": "policy",
          "type": {
            "defined": {
              "name": "policy"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "book",
      "discriminator": [
        121,
        34,
        121,
        35,
        91,
        62,
        85,
        222
      ]
    }
  ],
  "events": [
    {
      "name": "bookClosed",
      "discriminator": [
        82,
        77,
        120,
        113,
        7,
        80,
        29,
        41
      ]
    },
    {
      "name": "bookOpened",
      "discriminator": [
        191,
        148,
        160,
        228,
        141,
        67,
        194,
        64
      ]
    },
    {
      "name": "policySet",
      "discriminator": [
        126,
        246,
        69,
        48,
        9,
        240,
        226,
        52
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "policyEmpty",
      "msg": "A mix policy must have at least one leg."
    },
    {
      "code": 6001,
      "name": "policyTooManyLegs",
      "msg": "A mix policy may hold at most 8 legs."
    },
    {
      "code": 6002,
      "name": "policyWeightsWrong",
      "msg": "Mix weights must add up to exactly 100%."
    },
    {
      "code": 6003,
      "name": "policyWeightsOverflow",
      "msg": "Mix weights overflowed while being added up."
    },
    {
      "code": 6004,
      "name": "legWeightZero",
      "msg": "A leg cannot have a weight of zero — remove it instead."
    },
    {
      "code": 6005,
      "name": "legMintDefault",
      "msg": "A leg cannot name the default address as its mint."
    },
    {
      "code": 6006,
      "name": "legDuplicated",
      "msg": "The same mint appears twice in this mix."
    },
    {
      "code": 6007,
      "name": "driftBandTooWide",
      "msg": "The drift band cannot be wider than 50%."
    },
    {
      "code": 6008,
      "name": "notTheOwner",
      "msg": "Only the owner of this book can change it."
    }
  ],
  "types": [
    {
      "name": "book",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "lifetimeReceived",
            "docs": [
              "Lifetime USD value received, in 6-decimal base units."
            ],
            "type": "u64"
          },
          {
            "name": "lifetimeSent",
            "docs": [
              "Lifetime USD value sent, in 6-decimal base units."
            ],
            "type": "u64"
          },
          {
            "name": "policy",
            "type": {
              "defined": {
                "name": "policy"
              }
            }
          }
        ]
      }
    },
    {
      "name": "bookClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "bookOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          },
          {
            "name": "legs",
            "type": {
              "vec": {
                "defined": {
                  "name": "leg"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "leg",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "bps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "policy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "legs",
            "type": {
              "vec": {
                "defined": {
                  "name": "leg"
                }
              }
            }
          },
          {
            "name": "driftBps",
            "docs": [
              "How far a leg may drift from its target before a rebalance is due, in basis points."
            ],
            "type": "u16"
          },
          {
            "name": "updatedAt",
            "docs": [
              "Set by the program from the clock, never by the caller. Any value passed in is",
              "overwritten — a timestamp a caller can choose is a timestamp that proves nothing."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "policySet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "at",
            "type": "i64"
          },
          {
            "name": "legs",
            "type": {
              "vec": {
                "defined": {
                  "name": "leg"
                }
              }
            }
          }
        ]
      }
    }
  ]
};
