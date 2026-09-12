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
      "name": "cancelPayout",
      "docs": [
        "Return an unreleased escrow to the payer and close the payout.",
        "",
        "`remaining_accounts` carries three accounts per leg, in leg order:",
        "[mint, the payout's token account, the payer's token account, that mint's token program]",
        "",
        "Only while unreleased. Once a receipt exists somebody has been told they were paid,",
        "and there is no instruction here that can take that back."
      ],
      "discriminator": [
        119,
        152,
        126,
        113,
        177,
        218,
        236,
        61
      ],
      "accounts": [
        {
          "name": "payout",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  111,
                  117,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payout.payer",
                "account": "payout"
              },
              {
                "kind": "account",
                "path": "payout.nonce",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true,
          "relations": [
            "payout"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "claimPayout",
      "docs": [
        "Claim a payout that names no recipient — the sponsored first position.",
        "",
        "A payout funded with the default pubkey as its recipient is a CLAIM PATH rather than a",
        "named payment: an issuer funds first grams into a book that does not exist yet, and",
        "whoever claims it becomes the recipient. Same escrow, same receipt, same cohort; the",
        "only difference is who signs and when the recipient is decided.",
        "",
        "ONE CLAIM PER PERSON PER CAMPAIGN, ENFORCED BY THE ACCOUNT MODEL RATHER THAN BY A",
        "CHECK. The receipt lives at [b\"receipt\", release_id, recipient], so a second claim by",
        "the same wallet in the same release tries to create an account that already exists and",
        "fails in the runtime. Nothing has to remember who claimed; the address IS the record.",
        "",
        "`remaining_accounts` carries four accounts per leg, in leg order:",
        "[mint, the payout's token account, the claimer's token account, that mint's token program]"
      ],
      "discriminator": [
        127,
        240,
        132,
        62,
        227,
        198,
        146,
        133
      ],
      "accounts": [
        {
          "name": "payout",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  111,
                  117,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payout.payer",
                "account": "payout"
              },
              {
                "kind": "account",
                "path": "payout.nonce",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "claimer",
          "docs": [
            "The person taking the sponsored position. They pay the rent for their own receipt,",
            "which is a few thousandths of a SOL and keeps the sponsor from being drained by",
            "account-creation spam."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payout.release_id",
                "account": "payout"
              },
              {
                "kind": "account",
                "path": "claimer"
              }
            ]
          }
        },
        {
          "name": "cohort",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  104,
                  111,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payout.release_id",
                "account": "payout"
              },
              {
                "kind": "account",
                "path": "claimer"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
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
      "name": "fundPayout",
      "docs": [
        "Escrow a payout for one named recipient.",
        "",
        "`remaining_accounts` carries three accounts per leg, in leg order:",
        "[mint, the payer's token account, the payout's token account, that mint's token program]",
        "The payout's token accounts are created by the caller in the same transaction; this",
        "program never creates an account it does not own the rule for.",
        "",
        "What is escrowed is ALREADY the recipient's mix — see payout.rs for why the swap",
        "happens in the payer's own funding transaction rather than in a PDA-signed Jupiter CPI",
        "at release."
      ],
      "discriminator": [
        29,
        105,
        203,
        76,
        139,
        85,
        21,
        111
      ],
      "accounts": [
        {
          "name": "payout",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  111,
                  117,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "recipient"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "releaseId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "valueBase",
          "type": "u64"
        },
        {
          "name": "gramsE8",
          "type": "u64"
        },
        {
          "name": "reason",
          "type": "string"
        },
        {
          "name": "legs",
          "type": {
            "vec": {
              "defined": {
                "name": "payoutLeg"
              }
            }
          }
        }
      ]
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
      "name": "releasePayout",
      "docs": [
        "Release an escrowed payout to its recipient, and write the receipt and the cohort.",
        "",
        "`remaining_accounts` carries three accounts per leg, in leg order:",
        "[mint, the payout's token account, the recipient's token account, that mint's token program]",
        "",
        "The receipt and the cohort are created in the SAME instruction as the transfers, so",
        "there is no state in which value moved and no record of it exists. A cohort recorded",
        "afterwards is a number somebody chose later, which is the whole difference between a",
        "payout and a farm."
      ],
      "discriminator": [
        181,
        87,
        198,
        92,
        64,
        3,
        24,
        155
      ],
      "accounts": [
        {
          "name": "payout",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  111,
                  117,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payout.payer",
                "account": "payout"
              },
              {
                "kind": "account",
                "path": "payout.nonce",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true,
          "relations": [
            "payout"
          ]
        },
        {
          "name": "receipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payout.release_id",
                "account": "payout"
              },
              {
                "kind": "account",
                "path": "payout.recipient",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "cohort",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  104,
                  111,
                  114,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payout.release_id",
                "account": "payout"
              },
              {
                "kind": "account",
                "path": "payout.recipient",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "setGoal",
      "docs": [
        "Create or replace a goal: a named target that skims a share of every inbound payout.",
        "",
        "A goal holds value and has NO DISCRETION OF ANY KIND. There is exactly one instruction",
        "that moves anything out of it, `withdraw_goal`, and it can only send to the owner. No",
        "third party, no address the owner did not sign for, no exceptions — the absence of a",
        "second destination is the whole guarantee, and it is enforced by there being no code",
        "that could do it rather than by a check that could be loosened."
      ],
      "discriminator": [
        36,
        91,
        124,
        161,
        86,
        107,
        200,
        74
      ],
      "accounts": [
        {
          "name": "goal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "slug"
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
          "name": "slug",
          "type": "string"
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "targetBase",
          "type": "u64"
        },
        {
          "name": "skimBps",
          "type": "u16"
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
    },
    {
      "name": "withdrawGoal",
      "docs": [
        "Move everything a goal holds to its owner. The only direction it can spend.",
        "",
        "`remaining_accounts` carries four accounts per leg, in any order the caller likes:",
        "[mint, the goal's token account, the OWNER's token account, that mint's token program]"
      ],
      "discriminator": [
        225,
        118,
        237,
        14,
        250,
        204,
        54,
        36
      ],
      "accounts": [
        {
          "name": "goal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  111,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "goal.slug",
                "account": "goal"
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "goal"
          ]
        }
      ],
      "args": [
        {
          "name": "amounts",
          "type": {
            "vec": "u64"
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
    },
    {
      "name": "cohort",
      "discriminator": [
        137,
        17,
        213,
        61,
        105,
        64,
        144,
        169
      ]
    },
    {
      "name": "goal",
      "discriminator": [
        163,
        66,
        166,
        245,
        130,
        131,
        207,
        26
      ]
    },
    {
      "name": "payout",
      "discriminator": [
        69,
        45,
        245,
        131,
        218,
        101,
        158,
        228
      ]
    },
    {
      "name": "receipt",
      "discriminator": [
        39,
        154,
        73,
        106,
        80,
        102,
        145,
        153
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
      "name": "goalSet",
      "discriminator": [
        190,
        25,
        191,
        35,
        229,
        89,
        29,
        226
      ]
    },
    {
      "name": "goalWithdrawn",
      "discriminator": [
        106,
        233,
        190,
        130,
        20,
        195,
        25,
        246
      ]
    },
    {
      "name": "payoutCancelled",
      "discriminator": [
        78,
        190,
        217,
        66,
        73,
        23,
        172,
        182
      ]
    },
    {
      "name": "payoutFunded",
      "discriminator": [
        31,
        49,
        241,
        217,
        135,
        46,
        76,
        155
      ]
    },
    {
      "name": "payoutReleased",
      "discriminator": [
        245,
        195,
        37,
        2,
        200,
        70,
        126,
        210
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
    },
    {
      "code": 6009,
      "name": "payoutEmpty",
      "msg": "A payout must move at least one asset."
    },
    {
      "code": 6010,
      "name": "payoutTooManyLegs",
      "msg": "A payout may carry at most 8 legs."
    },
    {
      "code": 6011,
      "name": "payoutLegZero",
      "msg": "A payout leg cannot be for zero — remove it instead."
    },
    {
      "code": 6012,
      "name": "payoutValueZero",
      "msg": "A payout must carry a value greater than zero."
    },
    {
      "code": 6013,
      "name": "reasonTooLong",
      "msg": "That reason is longer than 200 characters."
    },
    {
      "code": 6014,
      "name": "legAccountsMismatch",
      "msg": "The accounts supplied do not match the legs of this payout."
    },
    {
      "code": 6015,
      "name": "legMintMismatch",
      "msg": "A token account does not hold the mint this leg names."
    },
    {
      "code": 6016,
      "name": "legWrongOwner",
      "msg": "A token account is not owned by the account this leg requires."
    },
    {
      "code": 6017,
      "name": "escrowNotUnderRule",
      "msg": "Escrow must be held by the payout account and nowhere else."
    },
    {
      "code": 6018,
      "name": "wrongRecipient",
      "msg": "That destination does not belong to this payout's recipient."
    },
    {
      "code": 6019,
      "name": "alreadyReleased",
      "msg": "This payout has already been released."
    },
    {
      "code": 6020,
      "name": "wrongTokenProgram",
      "msg": "That token program does not own the mint this leg names."
    },
    {
      "code": 6021,
      "name": "notClaimable",
      "msg": "This payout names a recipient, so it cannot be claimed."
    },
    {
      "code": 6022,
      "name": "goalSlugLength",
      "msg": "A goal's slug must be between 1 and 32 characters."
    },
    {
      "code": 6023,
      "name": "goalNameLength",
      "msg": "A goal's name must be between 1 and 64 characters."
    },
    {
      "code": 6024,
      "name": "skimTooLarge",
      "msg": "A goal cannot skim more than half of an inbound payout."
    },
    {
      "code": 6025,
      "name": "goalPaysOnlyItsOwner",
      "msg": "A goal can only ever pay its own owner."
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
      "name": "cohort",
      "docs": [
        "KEEP-RATE, AND WHY IT CANNOT BE FAKED.",
        "",
        "Written at release, in the same instruction as the receipt, and never rewritten. A cohort",
        "reconstructed afterwards is a balance measured against a number somebody chose later —",
        "which is exactly the difference between a payout and a farm, and exactly the number this",
        "account exists to make un-inventable."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "releaseId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "valueAtReleaseBase",
            "type": "u64"
          },
          {
            "name": "releasedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "goal",
      "docs": [
        "A named goal that skims a share of every inbound payout.",
        "",
        "It can spend in exactly one direction — to its owner — and it has no discretion of any",
        "kind. That guarantee is not a check somebody could loosen; it is the absence of any code",
        "that could send anywhere else."
      ],
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
            "name": "slug",
            "type": "string"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "targetBase",
            "docs": [
              "What the owner is saving toward, in 6-decimal USD base units. A target, never a limit:",
              "nothing stops at it and nothing is refused for exceeding it."
            ],
            "type": "u64"
          },
          {
            "name": "skimBps",
            "type": "u16"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "goalSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "goal",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "slug",
            "type": "string"
          },
          {
            "name": "skimBps",
            "type": "u16"
          },
          {
            "name": "targetBase",
            "type": "u64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "goalWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "goal",
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
      "name": "payout",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "releaseId",
            "docs": [
              "Groups every payout in one release, so keep-rate is a query over a cohort."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "valueBase",
            "docs": [
              "USD value at the price stamp, 6-decimal base units."
            ],
            "type": "u64"
          },
          {
            "name": "gramsE8",
            "docs": [
              "Fine grams of gold in this payout, in 1e8 fixed point, stamped at funding."
            ],
            "type": "u64"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "fundedAt",
            "type": "i64"
          },
          {
            "name": "releasedAt",
            "docs": [
              "0 until released. The one bit that decides whether escrow may still be returned."
            ],
            "type": "i64"
          },
          {
            "name": "legs",
            "type": {
              "vec": {
                "defined": {
                  "name": "payoutLeg"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "payoutCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payout",
            "type": "pubkey"
          },
          {
            "name": "payer",
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
      "name": "payoutFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payout",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "releaseId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "valueBase",
            "type": "u64"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "payoutLeg",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "Token base units of THAT mint. Never a dollar amount."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "payoutReleased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "receipt",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "releaseId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "valueBase",
            "type": "u64"
          },
          {
            "name": "gramsE8",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "at",
            "type": "i64"
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
    },
    {
      "name": "receipt",
      "docs": [
        "THE NAMED ARRIVAL — the product itself, and an account rather than only an event.",
        "",
        "A memory that lives only in a database is one we can lose, or be accused of inventing. One",
        "that lives here can be opened by anyone, forever, and survives us. It carries what landed,",
        "from whom, for what, and what it was worth at the moment it landed."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "releaseId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "valueBase",
            "type": "u64"
          },
          {
            "name": "gramsE8",
            "type": "u64"
          },
          {
            "name": "reason",
            "type": "string"
          },
          {
            "name": "at",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "legs",
            "type": {
              "vec": {
                "defined": {
                  "name": "payoutLeg"
                }
              }
            }
          }
        ]
      }
    }
  ]
};
