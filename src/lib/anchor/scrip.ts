/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/scrip.json`.
 */
export type Scrip = {
  "address": "Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj",
  "metadata": {
    "name": "scrip",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Scrip — a rule on a wallet. Holds the rule and the receipts, never the assets."
  },
  "docs": [
    "# Scrip — a rule on a wallet",
    "",
    "THE PROGRAM IS NEVER THE VAULT. The owner's USDC and the owner's stock both sit in the",
    "owner's own token accounts. The program holds three things: the rule the owner signed,",
    "the receipts it writes, and — for the length of one transaction, or one open intake —",
    "an escrow on its way to a recipient.",
    "",
    "THE PROGRAM NEVER DECIDES HOW MUCH. The rate is the owner's. The price is Pyth's. The",
    "route is the keeper's, bounded by the owner's tolerance. The timing is arrival. There is",
    "no instruction here that lets anyone — keeper, payer, deployer — choose an amount.",
    "",
    "PAUSING IS A TOKEN-PROGRAM REVOKE. The rule works through a delegate allowance the owner",
    "approved on their own USDC account. Revoking it is an instruction on the token program,",
    "and nothing in this program can prevent, delay or reverse it."
  ],
  "instructions": [
    {
      "name": "beginSweep",
      "docs": [
        "The first half of a sweep. Computes the slice from on-chain state and moves exactly",
        "that much USDC to the keeper through the delegate — but ONLY after proving, through",
        "the instructions sysvar, that a `finish_sweep` for this book and release id follows in",
        "this same transaction. If it does not, this refuses. If it does and fails, everything",
        "here reverts with it, including this transfer."
      ],
      "discriminator": [
        147,
        244,
        224,
        21,
        162,
        70,
        107,
        89
      ],
      "accounts": [
        {
          "name": "keeper",
          "writable": true,
          "signer": true
        },
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
                "path": "book.owner",
                "account": "book"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "ownerUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "usdcProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "keeperUsdc",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "keeper"
              },
              {
                "kind": "account",
                "path": "usdcProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "ownerAsset",
          "docs": [
            "the handler, and created there if it does not exist yet."
          ],
          "writable": true
        },
        {
          "name": "usdcProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "releaseId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "cancelPayout",
      "docs": [
        "Take back a sponsored position nobody claimed, after thirty days."
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
          "name": "payer",
          "writable": true,
          "signer": true,
          "relations": [
            "payout"
          ]
        },
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
                "kind": "account",
                "path": "payout.release_id",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payout"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "payerAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimPayout",
      "docs": [
        "Claim a sponsored position into the claimer's own wallet. The claimer needs a Book",
        "(the client prepends `open_book`); the fee and the rent may be paid by a relayer."
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
          "name": "claimer",
          "docs": [
            "The person taking the position. Signs, but need not hold any SOL."
          ],
          "signer": true
        },
        {
          "name": "feePayer",
          "docs": [
            "Pays the fee, the receipt's rent and the token account's rent. A relayer, or the",
            "claimer themselves."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "claimKey",
          "docs": [
            "The claim key, for a sponsorship addressed to a link rather than an address."
          ],
          "signer": true,
          "optional": true
        },
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
                "path": "payout.release_id",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "claimerBook",
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
                "path": "claimer"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payout"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "claimerAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "claimer"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "priceUpdate",
          "optional": true
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
                "path": "payout"
              },
              {
                "kind": "account",
                "path": "payout.release_id",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
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
        "Close the book and its handle. Returns the rent and the float to the owner."
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
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "book",
            "handle"
          ]
        },
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
          "name": "handle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "book.slug",
                "account": "book"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "closeGrant",
      "docs": [
        "Close a finished grant: the escrow is empty (everything vested, or returned), and the",
        "rent and the remaining float go back to the payer. An unsealed grant closes too, its",
        "escrow returned to the payer."
      ],
      "discriminator": [
        70,
        22,
        221,
        111,
        171,
        253,
        39,
        217
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "grant.grant_id",
                "account": "grant"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "grant"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "payerAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "disableRule",
      "docs": [
        "Turn the rule off. The client puts `revoke` BEFORE this instruction; the program",
        "checks that the delegate is gone. Pausing WITHOUT this instruction is `revoke` alone,",
        "which this program cannot see coming and cannot prevent."
      ],
      "discriminator": [
        98,
        20,
        112,
        62,
        207,
        167,
        81,
        99
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "book"
          ]
        },
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
          "name": "usdcMint"
        },
        {
          "name": "ownerUsdc",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "usdcProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "enableRule",
      "docs": [
        "Turn the rule on. The client puts `approve_checked(delegate = book)` and a system",
        "transfer of float BEFORE this instruction in the same transaction, so \"on\" on chain",
        "means the delegate really is set."
      ],
      "discriminator": [
        91,
        250,
        158,
        53,
        78,
        195,
        245,
        63
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "book"
          ]
        },
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
          "name": "usdcMint"
        },
        {
          "name": "ownerUsdc",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "usdcProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "rateBps",
          "type": "u16"
        },
        {
          "name": "escalateBps",
          "type": "u16"
        },
        {
          "name": "floorUsdc",
          "type": "u64"
        },
        {
          "name": "capUsdc",
          "type": "u64"
        },
        {
          "name": "toleranceBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "finishSweep",
      "docs": [
        "The second half. Verifies what arrived against Pyth, writes the receipt, pays the",
        "keeper from the float. Any failure here reverts the whole transaction, delegate",
        "transfer included."
      ],
      "discriminator": [
        133,
        112,
        102,
        75,
        47,
        225,
        150,
        42
      ],
      "accounts": [
        {
          "name": "keeper",
          "writable": true,
          "signer": true
        },
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
                "path": "book.owner",
                "account": "book"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "ownerUsdc",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "usdcProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "ownerAsset",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "priceUpdate"
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
                "path": "book"
              },
              {
                "kind": "arg",
                "path": "releaseId"
              }
            ]
          }
        },
        {
          "name": "usdcProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "releaseId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "fundPayout",
      "docs": [
        "Create the escrow for an intake. A Jupiter swap in the same transaction fills it."
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
          "name": "payer",
          "writable": true,
          "signer": true
        },
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
                "path": "releaseId"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payout"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipientBook",
          "docs": [
            "The recipient's Book: required for Settle, where the asset must match."
          ],
          "optional": true
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "releaseId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "kind",
          "type": {
            "defined": {
              "name": "payoutKind"
            }
          }
        },
        {
          "name": "recipient",
          "type": "pubkey"
        },
        {
          "name": "claimant",
          "type": "pubkey"
        },
        {
          "name": "reasonHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "declaredUsdc",
          "type": "u64"
        },
        {
          "name": "minOutRaw",
          "type": "u64"
        },
        {
          "name": "runId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "measureReceipt",
      "docs": [
        "Record the recipient's raw balance of the asset at 7 or 30 days. Anyone may call it;",
        "the answer comes from the recipient's own token account and nowhere else."
      ],
      "discriminator": [
        169,
        214,
        212,
        30,
        165,
        159,
        2,
        12
      ],
      "accounts": [
        {
          "name": "receipt",
          "writable": true
        },
        {
          "name": "recipientAsset",
          "docs": [
            "derivation; may not exist, which reads as a balance of zero."
          ]
        },
        {
          "name": "assetMint"
        },
        {
          "name": "assetTokenProgram"
        }
      ],
      "args": [
        {
          "name": "windowDays",
          "type": "u8"
        }
      ]
    },
    {
      "name": "openBook",
      "docs": [
        "Open a book: a handle, an asset, an attestation. One per owner. The rent may be paid",
        "by somebody else, so a claim from an empty wallet can open a book on the way."
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
          "name": "owner",
          "signer": true
        },
        {
          "name": "payer",
          "docs": [
            "Whoever pays the rent. The owner, or a relayer sponsoring a claim."
          ],
          "writable": true,
          "signer": true
        },
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
          "name": "handle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  97,
                  110,
                  100,
                  108,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "slug"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "usdcMint"
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
          "name": "termsVersion",
          "type": "u8"
        },
        {
          "name": "kind",
          "type": {
            "defined": {
              "name": "handleKind"
            }
          }
        }
      ]
    },
    {
      "name": "openGrant",
      "docs": [
        "Open a grant: the escrow the stock will vest from, and the recipient's own asset",
        "account if they have none yet. The client puts a Memo, the Jupiter route (USDC →",
        "asset, destination = the escrow) and `seal_grant` in the same transaction."
      ],
      "discriminator": [
        115,
        112,
        213,
        95,
        124,
        181,
        141,
        104
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "recipient"
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "grantId"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "grant"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipientAsset",
          "docs": [
            "The recipient's own account, created now by the payer so every vest is one instruction."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "grantId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        },
        {
          "name": "startUnix",
          "type": "i64"
        },
        {
          "name": "cliffSecs",
          "type": "u32"
        },
        {
          "name": "durationSecs",
          "type": "u32"
        },
        {
          "name": "revocable",
          "type": "bool"
        },
        {
          "name": "reasonHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "declaredUsdc",
          "type": "u64"
        },
        {
          "name": "minOutRaw",
          "type": "u64"
        },
        {
          "name": "runId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "releasePayout",
      "docs": [
        "Release a settle payout: escrow → the recipient's own account, receipt, close."
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
          "name": "payer",
          "writable": true,
          "signer": true,
          "relations": [
            "payout"
          ]
        },
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
                "kind": "account",
                "path": "payout.release_id",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "recipient"
        },
        {
          "name": "recipientBook",
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
                "path": "recipient"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payout"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipientAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "priceUpdate",
          "optional": true
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
                "path": "payout"
              },
              {
                "kind": "account",
                "path": "payout.release_id",
                "account": "payout"
              }
            ]
          }
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "revokeGrant",
      "docs": [
        "Revoke a revocable grant: what had not accrued returns to the payer; what had accrued",
        "stays claimable by `vest`, receipt and all."
      ],
      "discriminator": [
        134,
        180,
        57,
        39,
        152,
        7,
        154,
        98
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "grant.grant_id",
                "account": "grant"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "grant"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "payerAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "sealGrant",
      "docs": [
        "Seal the grant, in the same transaction as the route: the escrow holds at least the",
        "payer's own minimum, the total is fixed, the float that pays for vest receipts and",
        "tips is deposited, and the grant's own receipt is written."
      ],
      "discriminator": [
        226,
        106,
        184,
        106,
        232,
        218,
        32,
        138
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true,
          "relations": [
            "grant"
          ]
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "account",
                "path": "grant.grant_id",
                "account": "grant"
              }
            ]
          }
        },
        {
          "name": "assetMint"
        },
        {
          "name": "escrow",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "grant"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
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
                "path": "grant"
              },
              {
                "kind": "account",
                "path": "grant.grant_id",
                "account": "grant"
              }
            ]
          }
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "floatLamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setAsset",
      "docs": [
        "Change the asset the rule buys. The watermark resets to the current balance so the",
        "change never taxes money that already landed."
      ],
      "discriminator": [
        243,
        216,
        48,
        30,
        63,
        58,
        91,
        239
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "book"
          ]
        },
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
          "name": "assetMint"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "ownerUsdc",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "usdcProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "termsVersion",
          "type": "u8"
        }
      ]
    },
    {
      "name": "setRule",
      "docs": [
        "Change the rule, or resume it after a pause: the watermark resets to the current",
        "balance, so money that landed while paused is not taxed retroactively. The escalation",
        "clock restarts only if the rate or the escalation changed."
      ],
      "discriminator": [
        237,
        148,
        178,
        172,
        127,
        70,
        114,
        103
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "book"
          ]
        },
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
          "name": "usdcMint"
        },
        {
          "name": "ownerUsdc",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "usdcProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "rateBps",
          "type": "u16"
        },
        {
          "name": "escalateBps",
          "type": "u16"
        },
        {
          "name": "floorUsdc",
          "type": "u64"
        },
        {
          "name": "capUsdc",
          "type": "u64"
        },
        {
          "name": "toleranceBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "syncWatermark",
      "docs": [
        "Lower the watermark to the balance after the owner spent. Anyone may call it, because",
        "it can only ever set the watermark to the TRUE balance, and only downward: it cannot",
        "make money that already landed taxable, only stop a spend from hiding the next arrival.",
        "Without it, an owner who spent $700 would see nothing convert until their balance had",
        "climbed back past the old mark. A sweep that finds nothing to sweep reverts, so the",
        "adjustment needs a transaction of its own."
      ],
      "discriminator": [
        245,
        200,
        201,
        29,
        54,
        238,
        98,
        158
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
                "path": "book.owner",
                "account": "book"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "ownerUsdc",
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "usdcProgram"
              },
              {
                "kind": "account",
                "path": "usdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "usdcProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "vest",
      "docs": [
        "Vest what the schedule has released: escrow → the recipient's own account, with a",
        "receipt. Anyone may call it; the caller is repaid the tip and the receipt's rent from",
        "the grant's float. A revoked grant still vests what had accrued by the revoke."
      ],
      "discriminator": [
        31,
        126,
        204,
        166,
        115,
        93,
        182,
        133
      ],
      "accounts": [
        {
          "name": "keeper",
          "docs": [
            "Whoever calls it: a keeper, the recipient, the payer. Repaid from the float."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "grant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "grant.payer",
                "account": "grant"
              },
              {
                "kind": "account",
                "path": "grant.grant_id",
                "account": "grant"
              }
            ]
          }
        },
        {
          "name": "recipient"
        },
        {
          "name": "assetMint"
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "grant"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "recipientAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "account",
                "path": "assetTokenProgram"
              },
              {
                "kind": "account",
                "path": "assetMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
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
                "path": "grant"
              },
              {
                "kind": "arg",
                "path": "releaseId"
              }
            ]
          }
        },
        {
          "name": "assetTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "releaseId",
          "type": {
            "array": [
              "u8",
              16
            ]
          }
        }
      ]
    },
    {
      "name": "withdrawFloat",
      "docs": [
        "Take float back. Depositing needs no instruction: a system transfer to the Book's",
        "address is the deposit."
      ],
      "discriminator": [
        125,
        240,
        168,
        82,
        15,
        86,
        88,
        231
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "book"
          ]
        },
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
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
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
      "name": "grant",
      "discriminator": [
        161,
        166,
        11,
        205,
        204,
        135,
        205,
        54
      ]
    },
    {
      "name": "handle",
      "discriminator": [
        150,
        96,
        143,
        54,
        64,
        147,
        63,
        63
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
      "name": "assetChanged",
      "discriminator": [
        15,
        176,
        34,
        9,
        251,
        38,
        127,
        93
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
      "name": "cancelled",
      "discriminator": [
        136,
        23,
        42,
        65,
        143,
        233,
        234,
        46
      ]
    },
    {
      "name": "grantOpened",
      "discriminator": [
        129,
        222,
        81,
        112,
        216,
        93,
        237,
        62
      ]
    },
    {
      "name": "grantRevoked",
      "discriminator": [
        192,
        60,
        253,
        12,
        110,
        158,
        200,
        30
      ]
    },
    {
      "name": "measured",
      "discriminator": [
        214,
        196,
        6,
        93,
        13,
        57,
        123,
        181
      ]
    },
    {
      "name": "ruleChanged",
      "discriminator": [
        147,
        20,
        162,
        144,
        101,
        106,
        253,
        191
      ]
    },
    {
      "name": "settled",
      "discriminator": [
        232,
        210,
        40,
        17,
        142,
        124,
        145,
        238
      ]
    },
    {
      "name": "swept",
      "discriminator": [
        254,
        138,
        9,
        198,
        192,
        61,
        165,
        135
      ]
    },
    {
      "name": "vested",
      "discriminator": [
        200,
        207,
        222,
        156,
        71,
        53,
        197,
        243
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "slugInvalid",
      "msg": "A handle is 3 to 24 characters of a-z and 0-9."
    },
    {
      "code": 6001,
      "name": "assetNotRegistered",
      "msg": "That asset is not on the registry."
    },
    {
      "code": 6002,
      "name": "termsRequired",
      "msg": "An xStocks asset needs an eligibility attestation (terms_version >= 1)."
    },
    {
      "code": 6003,
      "name": "wrongUsdcMint",
      "msg": "The pay-in mint is not the one this program accepts."
    },
    {
      "code": 6004,
      "name": "wrongUsdcDecimals",
      "msg": "The pay-in mint must have six decimals."
    },
    {
      "code": 6005,
      "name": "rateOutOfRange",
      "msg": "The rate must be between 0.01% and 50%."
    },
    {
      "code": 6006,
      "name": "escalationOutOfRange",
      "msg": "Escalation must be between 0 and 50%."
    },
    {
      "code": 6007,
      "name": "toleranceOutOfRange",
      "msg": "The tolerance must be between 0.5% and 3%."
    },
    {
      "code": 6008,
      "name": "ruleAlreadyEnabled",
      "msg": "The rule is already on."
    },
    {
      "code": 6009,
      "name": "ruleNotEnabled",
      "msg": "The rule is not on."
    },
    {
      "code": 6010,
      "name": "rulePending",
      "msg": "A sweep is in progress; finish it first."
    },
    {
      "code": 6011,
      "name": "delegateNotSet",
      "msg": "The Book is not the delegate on the USDC account. Approve it first."
    },
    {
      "code": 6012,
      "name": "delegateStillSet",
      "msg": "The delegate is still set. Revoke it in the same transaction."
    },
    {
      "code": 6013,
      "name": "notTopLevel",
      "msg": "This instruction must be top-level, not a CPI."
    },
    {
      "code": 6014,
      "name": "noFinishSweep",
      "msg": "No finish_sweep for this book and release follows in this transaction."
    },
    {
      "code": 6015,
      "name": "multipleBeginSweeps",
      "msg": "Exactly one begin_sweep per transaction."
    },
    {
      "code": 6016,
      "name": "inboundBelowMinimum",
      "msg": "The net inflow is below the rule's minimum."
    },
    {
      "code": 6017,
      "name": "sliceBelowMinimum",
      "msg": "The slice would be below the $0.50 minimum."
    },
    {
      "code": 6018,
      "name": "allowanceTooLow",
      "msg": "The delegate allowance is smaller than the slice. Re-approve."
    },
    {
      "code": 6019,
      "name": "floatTooLow",
      "msg": "The Book's float cannot cover the tip and the receipt's rent. Top up."
    },
    {
      "code": 6020,
      "name": "noPending",
      "msg": "There is no sweep pending on this book."
    },
    {
      "code": 6021,
      "name": "pendingMismatch",
      "msg": "The pending sweep does not match this instruction."
    },
    {
      "code": 6022,
      "name": "cashMoved",
      "msg": "The owner's cash moved between begin and finish. Nothing settles."
    },
    {
      "code": 6023,
      "name": "priceFeedWrong",
      "msg": "The price account is not for this book's asset."
    },
    {
      "code": 6024,
      "name": "priceStale",
      "msg": "The price is older than ten minutes. The sweep waits."
    },
    {
      "code": 6025,
      "name": "priceUncertain",
      "msg": "The price's confidence band is wider than 1%."
    },
    {
      "code": 6026,
      "name": "priceInvalid",
      "msg": "The price account could not be read."
    },
    {
      "code": 6027,
      "name": "priceNotFullyVerified",
      "msg": "The price update is not fully verified."
    },
    {
      "code": 6028,
      "name": "multiplierInvalid",
      "msg": "The mint's scaled-UI multiplier is outside anything a corporate action produces."
    },
    {
      "code": 6029,
      "name": "receivedBelowMinimum",
      "msg": "Less arrived than the price allows. Everything reverts."
    },
    {
      "code": 6030,
      "name": "notTheOwner",
      "msg": "Only the owner may do this."
    },
    {
      "code": 6031,
      "name": "wrongKind",
      "msg": "This payout is not of the kind this instruction handles."
    },
    {
      "code": 6032,
      "name": "escrowBelowMinimum",
      "msg": "The escrow holds less than the payer's own minimum."
    },
    {
      "code": 6033,
      "name": "escrowEmpty",
      "msg": "The escrow is empty."
    },
    {
      "code": 6034,
      "name": "recipientRequired",
      "msg": "A settle payout needs a recipient."
    },
    {
      "code": 6035,
      "name": "bookRequired",
      "msg": "A settle payout needs the recipient's Book."
    },
    {
      "code": 6036,
      "name": "assetMismatch",
      "msg": "The recipient's Book is set to a different asset."
    },
    {
      "code": 6037,
      "name": "notTheRecipient",
      "msg": "This payout is for someone else."
    },
    {
      "code": 6038,
      "name": "claimKeyRequired",
      "msg": "This payout needs its claim key."
    },
    {
      "code": 6039,
      "name": "tooEarlyToCancel",
      "msg": "A sponsored position may be cancelled after thirty days."
    },
    {
      "code": 6040,
      "name": "windowInvalid",
      "msg": "The window is 7 or 30 days."
    },
    {
      "code": 6041,
      "name": "tooEarlyToMeasure",
      "msg": "This receipt is not old enough to measure yet."
    },
    {
      "code": 6042,
      "name": "alreadyMeasured",
      "msg": "This window was already measured."
    },
    {
      "code": 6043,
      "name": "wrongAta",
      "msg": "That is not the associated token account this instruction expects."
    },
    {
      "code": 6044,
      "name": "overflow",
      "msg": "Arithmetic overflow."
    },
    {
      "code": 6045,
      "name": "ruleStillOn",
      "msg": "Turn the rule off before closing the book."
    },
    {
      "code": 6046,
      "name": "wrongTokenProgram",
      "msg": "The token program does not own that mint."
    },
    {
      "code": 6047,
      "name": "floatBelowRent",
      "msg": "The float withdrawal would leave the Book below its rent."
    },
    {
      "code": 6048,
      "name": "nothingToWithdraw",
      "msg": "Nothing to withdraw."
    },
    {
      "code": 6049,
      "name": "watermarkNotAbove",
      "msg": "The balance is not below the watermark; there is nothing to sync."
    },
    {
      "code": 6050,
      "name": "grantRecipientRequired",
      "msg": "A grant needs a recipient."
    },
    {
      "code": 6051,
      "name": "grantScheduleInvalid",
      "msg": "A grant's schedule must be within ten years."
    },
    {
      "code": 6052,
      "name": "grantNotSealed",
      "msg": "The grant is not sealed; nothing can vest."
    },
    {
      "code": 6053,
      "name": "grantAlreadySealed",
      "msg": "The grant was already sealed."
    },
    {
      "code": 6054,
      "name": "nothingToVest",
      "msg": "Nothing has vested yet."
    },
    {
      "code": 6055,
      "name": "grantNotActive",
      "msg": "This grant is not active."
    },
    {
      "code": 6056,
      "name": "grantNotRevocable",
      "msg": "This grant is not revocable."
    },
    {
      "code": 6057,
      "name": "grantStillOpen",
      "msg": "A grant closes only when completed or revoked, with an empty escrow."
    },
    {
      "code": 6058,
      "name": "grantFloatTooLow",
      "msg": "The grant's float cannot cover the tip and the receipt's rent. Top up."
    }
  ],
  "types": [
    {
      "name": "assetChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "asset",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "book",
      "docs": [
        "THE BOOK — one per owner, at `[\"book\", owner]`. It is also the token delegate address.",
        "",
        "It holds the rule, the watermark and a float of lamports above its own rent. It never",
        "holds a token: the owner's USDC and the owner's asset both sit in the owner's own",
        "associated token accounts, and the only power the Book has over them is the delegate",
        "allowance the owner approved and can revoke at any time without asking this program."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "slug",
            "type": "string"
          },
          {
            "name": "asset",
            "docs": [
              "The one asset the rule buys."
            ],
            "type": "pubkey"
          },
          {
            "name": "usdcMint",
            "docs": [
              "The pay-in mint. Mainnet: USDC, always. Devnet: whatever the test opened with."
            ],
            "type": "pubkey"
          },
          {
            "name": "feedRaw",
            "docs": [
              "Pyth feed id that prices one RAW token of the asset (e.g. Crypto.SPYX/USD). Zero = none."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "feedAdjusted",
            "docs": [
              "Pyth feed id that prices one UI unit — one share-equivalent — so the scaled-UI",
              "multiplier applies (e.g. Equity.US.SPY/USD). Zero = none."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "termsVersion",
            "docs": [
              "Eligibility attestation. >= 1 is required for an xStocks asset."
            ],
            "type": "u8"
          },
          {
            "name": "openedUnix",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "rule",
            "type": {
              "defined": {
                "name": "rule"
              }
            }
          },
          {
            "name": "pending",
            "type": {
              "option": {
                "defined": {
                  "name": "pending"
                }
              }
            }
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
            "name": "slug",
            "type": "string"
          },
          {
            "name": "asset",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "cancelled",
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
      "name": "grant",
      "docs": [
        "A GRANT — stock bought now that vests on a schedule, from anyone to anyone.",
        "",
        "`[\"grant\", payer, grant_id]`. The stock sits in the grant's own escrow token account,",
        "which the recipient can see and the payer cannot spend. Vesting is computed on RAW",
        "units, so a dividend reinvested through the multiplier while the stock waits goes to",
        "whoever the units vest to. A revoked grant returns only what had not vested; what had",
        "accrued by then stays claimable by `vest`."
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
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "grantId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "totalRaw",
            "docs": [
              "Raw units in escrow at seal. Zero until sealed."
            ],
            "type": "u64"
          },
          {
            "name": "releasedRaw",
            "type": "u64"
          },
          {
            "name": "releaseCapRaw",
            "docs": [
              "After a revoke: the most that may ever be released (what had accrued). u64::MAX otherwise."
            ],
            "type": "u64"
          },
          {
            "name": "startUnix",
            "type": "i64"
          },
          {
            "name": "cliffSecs",
            "type": "u32"
          },
          {
            "name": "durationSecs",
            "docs": [
              "Linear after the cliff; 0 = everything at the cliff."
            ],
            "type": "u32"
          },
          {
            "name": "revocable",
            "type": "bool"
          },
          {
            "name": "sealed",
            "type": "bool"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "grantState"
              }
            }
          },
          {
            "name": "reasonHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "declaredUsdc",
            "docs": [
              "The exact-in USDC of the purchase, for the record."
            ],
            "type": "u64"
          },
          {
            "name": "minOutRaw",
            "docs": [
              "The least the escrow may hold at seal, from the payer's own quote."
            ],
            "type": "u64"
          },
          {
            "name": "runId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "createdUnix",
            "type": "i64"
          },
          {
            "name": "vests",
            "type": "u32"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "grantOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "grant",
            "type": "pubkey"
          },
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
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "totalRaw",
            "type": "u64"
          },
          {
            "name": "startUnix",
            "type": "i64"
          },
          {
            "name": "cliffSecs",
            "type": "u32"
          },
          {
            "name": "durationSecs",
            "type": "u32"
          },
          {
            "name": "revocable",
            "type": "bool"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "grantRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "grant",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "returnedRaw",
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
      "name": "grantState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "completed"
          },
          {
            "name": "revoked"
          }
        ]
      }
    },
    {
      "name": "handle",
      "docs": [
        "`[\"handle\", slug]` → owner. What `/@<slug>` and `/pay/<slug>` resolve through."
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
            "name": "kind",
            "type": {
              "defined": {
                "name": "handleKind"
              }
            }
          }
        ]
      }
    },
    {
      "name": "handleKind",
      "docs": [
        "Who a handle names: a person with a rule, or an organisation that pays in stock."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "person"
          },
          {
            "name": "org"
          }
        ]
      }
    },
    {
      "name": "measured",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "receipt",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "windowDays",
            "type": "u8"
          },
          {
            "name": "balanceRaw",
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
      "name": "measurement",
      "docs": [
        "One keep-rate measurement. `at == 0` means not yet measured."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "at",
            "type": "i64"
          },
          {
            "name": "balanceRaw",
            "docs": [
              "The recipient's TOTAL raw balance of the asset at that instant. Raw, so a rebase",
              "never reads as a sale."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "payout",
      "docs": [
        "THE ESCROW — the only thing the program ever holds, and only while it is under a rule.",
        "",
        "A Payout exists exactly while it is open. Release, claim and cancel all close it, so",
        "there is no state field to drift from the truth: the account's existence is the state."
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
            "docs": [
              "Settle: required. Sponsor: the address, or `Pubkey::default()` for \"anyone with the key\"."
            ],
            "type": "pubkey"
          },
          {
            "name": "claimant",
            "docs": [
              "Sponsor with no address: the claim key's pubkey. Otherwise default."
            ],
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "payoutKind"
              }
            }
          },
          {
            "name": "releaseId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "reasonHash",
            "docs": [
              "sha256 of the reason, which travels as an SPL Memo in the same transaction."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "declaredUsdc",
            "docs": [
              "The exact-in USDC amount of the swap, in 6-decimal base units."
            ],
            "type": "u64"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "minOutRaw",
            "docs": [
              "The least the escrow may hold at release, from the payer's own quote."
            ],
            "type": "u64"
          },
          {
            "name": "createdUnix",
            "type": "i64"
          },
          {
            "name": "runId",
            "docs": [
              "The payroll run this payment belongs to, or zero. Copied onto the receipt."
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "payoutKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "settle"
          },
          {
            "name": "sponsor"
          }
        ]
      }
    },
    {
      "name": "pending",
      "docs": [
        "The state between `begin_sweep` and `finish_sweep`, inside one transaction."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "releaseId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "keeper",
            "type": "pubkey"
          },
          {
            "name": "inbound",
            "docs": [
              "The net inflow that triggered this sweep — the receipt's basis."
            ],
            "type": "u64"
          },
          {
            "name": "rateBps",
            "docs": [
              "The rate applied, after escalation."
            ],
            "type": "u16"
          },
          {
            "name": "slice",
            "type": "u64"
          },
          {
            "name": "usdcBefore",
            "docs": [
              "The owner's USDC balance after the slice left. Must be unchanged at finish."
            ],
            "type": "u64"
          },
          {
            "name": "assetBeforeRaw",
            "type": "u64"
          },
          {
            "name": "ataRent",
            "docs": [
              "Lamports the keeper advanced to create the owner's asset account, or 0."
            ],
            "type": "u64"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "priceStamp",
      "docs": [
        "The Pyth price a sweep was verified against. `feed` all-zero means no stamp (intake)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "feed",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "price",
            "type": "i64"
          },
          {
            "name": "expo",
            "type": "i32"
          },
          {
            "name": "conf",
            "type": "u64"
          },
          {
            "name": "publishTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "receipt",
      "docs": [
        "THE RECEIPT — permanent, ~350 bytes, written in the same transaction as the conversion.",
        "",
        "`[\"receipt\", book, release_id]` for a sweep; `[\"receipt\", payout, release_id]` for an",
        "intake. A memory that lives only in a database is one that can be lost or be accused of",
        "invention. This one can be opened by anyone, forever, and outlives the company."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "receiptKind"
              }
            }
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "docs": [
              "Sweep: default (attributed off chain from transfer history). Intake: the payer."
            ],
            "type": "pubkey"
          },
          {
            "name": "submitter",
            "docs": [
              "Who paid the fee and signed: the keeper, the payer, or the relayer."
            ],
            "type": "pubkey"
          },
          {
            "name": "book",
            "docs": [
              "The recipient's Book."
            ],
            "type": "pubkey"
          },
          {
            "name": "releaseId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "runId",
            "docs": [
              "The payroll run this receipt belongs to, or zero."
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "reasonHash",
            "docs": [
              "Zero for a sweep."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "basisUsdc",
            "docs": [
              "Sweep: the net inflow that triggered it. Intake: what was paid."
            ],
            "type": "u64"
          },
          {
            "name": "rateBps",
            "docs": [
              "Sweep: the rate applied. Intake: 10_000."
            ],
            "type": "u16"
          },
          {
            "name": "paidUsdc",
            "docs": [
              "The USDC actually converted."
            ],
            "type": "u64"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "amountRaw",
            "docs": [
              "Raw token units received. Never a UI amount."
            ],
            "type": "u64"
          },
          {
            "name": "price",
            "type": {
              "defined": {
                "name": "priceStamp"
              }
            }
          },
          {
            "name": "settledSlot",
            "type": "u64"
          },
          {
            "name": "settledUnix",
            "type": "i64"
          },
          {
            "name": "measured7d",
            "type": {
              "defined": {
                "name": "measurement"
              }
            }
          },
          {
            "name": "measured30d",
            "type": {
              "defined": {
                "name": "measurement"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "receiptKind",
      "docs": [
        "What a receipt records. A stock was swept under a rule, paid, given to an empty wallet,",
        "granted on a schedule, or vested from a grant."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "sweep"
          },
          {
            "name": "pay"
          },
          {
            "name": "gift"
          },
          {
            "name": "grant"
          },
          {
            "name": "vest"
          }
        ]
      }
    },
    {
      "name": "rule",
      "docs": [
        "The rule and its watermark. Lives inline on the Book so there is exactly one copy."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "rateBps",
            "docs": [
              "1..=MAX_RATE_BPS. The share of a net inflow that becomes the asset."
            ],
            "type": "u16"
          },
          {
            "name": "escalateBps",
            "docs": [
              "Added to `rate_bps` every ESCALATION_PERIOD after `enabled_unix`. 0 = none."
            ],
            "type": "u16"
          },
          {
            "name": "floorUsdc",
            "docs": [
              "Never sweep below this much USDC. 0 = no floor."
            ],
            "type": "u64"
          },
          {
            "name": "capUsdc",
            "docs": [
              "The most of one inflow that is taxable. 0 = no cap."
            ],
            "type": "u64"
          },
          {
            "name": "minInbound",
            "docs": [
              "An inflow smaller than this is ignored."
            ],
            "type": "u64"
          },
          {
            "name": "toleranceBps",
            "docs": [
              "How far below the Pyth price (net of confidence) a fill may land. 50..=300."
            ],
            "type": "u16"
          },
          {
            "name": "watermark",
            "docs": [
              "The USDC balance the rule has already seen. Everything above it is new."
            ],
            "type": "u64"
          },
          {
            "name": "enabledUnix",
            "type": "i64"
          },
          {
            "name": "sweeps",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "ruleChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "rateBps",
            "type": "u16"
          },
          {
            "name": "watermark",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "settled",
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
                16
              ]
            }
          },
          {
            "name": "paidUsdc",
            "type": "u64"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "amountRaw",
            "type": "u64"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "receiptKind"
              }
            }
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "swept",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "receipt",
            "type": "pubkey"
          },
          {
            "name": "book",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "releaseId",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "inbound",
            "type": "u64"
          },
          {
            "name": "rateBps",
            "type": "u16"
          },
          {
            "name": "slice",
            "type": "u64"
          },
          {
            "name": "asset",
            "type": "pubkey"
          },
          {
            "name": "amountRaw",
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
      "name": "vested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "grant",
            "type": "pubkey"
          },
          {
            "name": "receipt",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amountRaw",
            "type": "u64"
          },
          {
            "name": "releasedRaw",
            "type": "u64"
          },
          {
            "name": "totalRaw",
            "type": "u64"
          },
          {
            "name": "completed",
            "type": "bool"
          },
          {
            "name": "at",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
