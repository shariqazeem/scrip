# Upgrading mainnet with Plans — the founder's runbook

## Done, 8 October 2026

Upgraded at slot 454,396,444 (`4Fyi21ixHNd3etWzbWJSU5xC8jW9JXMwjBzczdkYMBMy6jpLqUwgESZThcV4WYof2AMtFq5VbFrGivWHKZqJTj5T`)
with one command, `solana program deploy … --program-id Fbp8… --buffer <a buffer key kept on disk>
--with-compute-unit-price 10000 --max-sign-attempts 60`, which extended the program and upgraded
it in 19 seconds. The binary is 617,552 bytes (`fca62b79…6d76c`), 64 KB smaller than the first
Plans build, so the extension cost 0.1634 SOL instead of 0.4871; the 3.138 SOL buffer came back
in the same transaction. Rehearsed first on a local validator holding the old mainnet binary at
the real program id. Steps 2, 3, 5 and 6 below (Squads, a verified build) were not done: the
founder's key is still the only upgrade authority, and moving it to a multisig is one
`set-upgrade-authority` away.


Prepared 7 October 2026. **The founder signs every step; nothing here runs by itself.** The
plan's freeze applies: if Plans are not rehearsed, on a multisig and verified by 9 October,
they do not ship, and Save now, the rule, the Welcome bonus and Scrip Curve go without them.

## What changes

New accounts and instructions only. No existing account changes layout, so every receipt
already on mainnet still decodes, and every existing instruction behaves exactly as before.

| Added | What it does |
| --- | --- |
| `Plan ["plan", sponsor, plan_id]` | a sponsor's match: the stock, `match_bps`, a monthly cap per member, an escrow the Plan owns |
| `Member ["member", plan, owner]` | invited by the sponsor, joined by the owner's own signature |
| `open_plan` | terms and an empty escrow; a Jupiter route in the same transaction delivers into it |
| `add_member`, `remove_member` | the sponsor only |
| `accept_member` | the member only; receipts from before this never match |
| `match_receipt` | anyone; an active member's sweep receipt, once, the share × slice, priced at Pyth plus its band, capped by the month and the escrow |
| `close_plan` | the sponsor, with no members left; the escrow returns, paid matches stay where they are |

Proved on a local validator with the devnet build: the program's 26-test battery passes,
including six Plan tests (only the sponsor invites; nothing before joining; half the slice at
price plus band, once; the monthly cap; a short escrow pays what it has, then refuses; close
only with no members and never a clawback). `cargo test` covers the arithmetic (`plan.rs`).

## What it costs (read from mainnet's rent on 7 October)

| | SOL | |
| --- | --- | --- |
| the new binary | 681,264 bytes | was 585,384 |
| extending the program account by 95,880 bytes | 0.4871 | stays with the program; comes back only if the program is ever closed |
| the upgrade buffer | 3.4617 | returned when the upgrade lands |
| fees | about 0.01 | spent |
| **peak in the upgrade wallet** | **about 3.97** | |

## The order

### 1. Extend while the current key is still the authority

The Agave 4 CLI signs `extend` with the upgrade authority, so do it before the authority moves:

```bash
solana program extend Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj 95880 -k ~/scrip-authority.json -u mainnet-beta
```

### 2. A Squads 2-of-3 for the authority

At app.squads.so: a multisig with three members on three different devices (the founder's
wallet, a second wallet on another phone or a hardware wallet, and a third kept offline),
threshold 2. Note its **vault** address: that is the new authority.

### 3. A verified build

```bash
cargo install solana-verify
cd anchor && solana-verify build --library-name scrip
shasum -a 256 target/deploy/scrip.so
```

The verified build runs in Docker, so its bytes are reproducible by anyone from the commit.

### 4. Write the buffer and give it to the multisig

```bash
solana program write-buffer anchor/target/deploy/scrip.so -k ~/scrip-authority.json -u mainnet-beta --with-compute-unit-price 10000
solana program set-buffer-authority <BUFFER> --new-buffer-authority <SQUADS_VAULT> -k ~/scrip-authority.json -u mainnet-beta
```

### 5. Hand the program to the multisig

```bash
solana program set-upgrade-authority Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj \
  --new-upgrade-authority <SQUADS_VAULT> --skip-new-upgrade-authority-signer-check \
  -k ~/scrip-authority.json -u mainnet-beta
```

From here no single key can change the program.

### 6. Upgrade through Squads

In Squads: Developers, Programs, add `Fbp8…16gj`, create an upgrade with the buffer from step 4
and the spill address the founder controls. Two members approve; one executes.

### 7. Prove it, small

```bash
solana program show Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj -u mainnet-beta
solana-verify verify-from-repo -u mainnet-beta --program-id Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj https://github.com/shariqazeem/scrip --library-name scrip --mount-path anchor
```

Then a $5 Plan with a $1 monthly cap, one member (a second wallet), one $20 arrival, and the
keeper's match on its receipt. Update `/security` with the multisig and the verified hash.

## If it goes wrong

Before step 5, `solana program close --buffers -k ~/scrip-authority.json` returns any buffer's
rent. After step 5, every change, including a rollback to the old binary, is a Squads proposal
with two approvals. Keep `anchor/target/deploy/scrip-mainnet.so` (sha256 `92f9cbda…`): it is
the binary mainnet runs today.
