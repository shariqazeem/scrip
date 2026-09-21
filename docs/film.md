# The film — two minutes, shot on mainnet

> Phase 6 of `docs/SCRIP-COMPANY-PLAN.md`. The plan's rule governs every frame: **do not let
> the film explain**. Every scene shows a stub printing for a real person. Nobody narrates
> what the viewer is already watching.
>
> Written 18 September 2026 to be shot in one session, the day after mainnet is live.

---

## What must be true before the camera turns on

Shoot only when every line below is already true. The film is a record of a working thing, not
a demonstration staged for it.

- [ ] The program is on mainnet, and `npm run preflight -- --mainnet` says nothing is waiting.
- [ ] `@scrip` is open as an organisation, published, with the rule on at 10%.
- [ ] A paid RPC is configured. On the public endpoint the pages are slow and the film will
      show it.
- [ ] Both keepers are running and `/keepers` names them.
- [ ] At least one real person who is not the founder has a published register with a receipt.
- [ ] A grant is open with a cliff that has already passed, so a vest can land during the shoot.
- [ ] A CSV of a real run is ready: names of people actually being paid, real amounts.
- [ ] Telegram is linked on the founder's own register, so the message lands on the phone.
- [ ] The phone is in aeroplane-off, do-not-disturb on, brightness at maximum, notifications
      cleared except Scrip's.

---

## The shot list

Total 1:55–2:00. Timecodes are targets, not a cut list; keep each shot as long as the real
thing takes and trim in the edit.

### 00:00–00:10 — The floor, alive, before anything is said

**On screen.** `scrip.app` on a laptop, full screen. The tape is moving. The clock reads
"NYSE closed, opens in N h · Scrip open."

**Why it is first.** A stranger must see that things are happening without them. No logo card,
no title, no voice. The only text on screen is the product's own.

**Cut when** a stub prints on the tape by itself.

### 00:10–00:35 — The silent address

**On screen.** A phone in frame beside the laptop. On the phone: an ordinary wallet, sending
$5 of USDC to an address. No Scrip app on the phone. The laptop shows `@scrip` live.

**What happens, in order, all real.**
1. The phone's wallet confirms the transfer.
2. On the laptop, a dashed ghost stub appears within a few seconds: money has landed and is
   not yet swept.
3. The ghost becomes a printed stub: `$5.00 landed · 10% became 0.00xx SPYx`.
4. The Telegram message arrives on the phone. It says the same thing.

**The one line of voice, if any:** *"The payer just sent dollars."*

**Cut when** the stub has printed and the phone has buzzed. This is the whole product; give it
room.

### 00:35–00:50 — The receipt, opened by a stranger

**On screen.** Open the receipt from the tape in a private window — no session, nothing signed
in. The stub fills the screen: what arrived, the rate, the price it settled at, the Pyth feed,
the transaction it is anchored to, and the two measurement rows that are not yet due.

**Why.** Everything a judge would want to check is on one page, and it opened without an
account.

### 00:50–01:15 — Paying a team in ownership

**On screen.** `/app/org/runs`. Drop the CSV. The file becomes lines: handle, amount, reason.
One signature in the wallet popup. The toast walks from building to confirming to settled.

**Then** `/run/<id>`: N of N paid, the total, and every line a receipt with its own reason —
real reasons for real work.

**The one line of voice, if any:** *"One signature. Every line is its own receipt, and it says
what it was for."*

### 01:15–01:35 — A grant that vests, without the payer

**On screen.** `/grant/<pda>`: the units, what it cost, the schedule as a bar, what has vested,
and the next vest. Then the keeper's vest lands during the shot, or cut to the vest receipt it
wrote minutes earlier.

**The point to make visible, not to say.** The escrow is not Scrip's and not the payer's to
spend. The release happened because the schedule allowed it and a keeper called it — the payer
was not involved.

### 01:35–01:50 — Two keepers, racing

**On screen.** `/keepers`: both keepers named by the receipts they wrote, their health, and the
five can/cannot lines. Then `/security`: the program id, the deployed byte length, the upgrade
authority, the build hash.

**Why here.** This is the answer to "what is the catch", placed after the viewer already
believes the product works.

### 01:50–02:00 — The floor again, and the line

**On screen.** Back to `scrip.app`, scrolled to the close. The tape has moved since 00:00, with
the film's own receipts on it.

**The last frame.** "Set a rate once. Then get paid." Nothing after it. No logo sting.

---

## Rules for the edit

- **No music with a drop.** Something quiet, or nothing. The tape's own movement is the rhythm.
- **No motion graphics.** Every animation on screen is the product's own.
- **No stock footage, no faces that are not really involved, no invented names.**
- **Real timestamps.** Never speed up a settle to make it look faster; it is already seconds.
- **Show the failure if it happens.** If a route fills below the Pyth minimum and the whole
  transaction reverts, that is the best shot in the film. Nothing moved, and the page says why.
- **Captions over voice** wherever a sentence is needed. The product's own words, verbatim.
- **Two minutes maximum.** If something has to go, it is a voice line, never a stub printing.

## What the film must never claim

No returns, no projections, no "imagine if". No user counts that are not on the ledger. No
mention of a token. No comparison to a named competitor. If a sentence could not be checked by
opening a page in the film, it does not go in.

---

## The submission text, alongside it

The README already opens with the manifesto and the seven firsts, each linked to where it
happened. The submission repeats that table with a **mainnet signature in every row** — filled
in as the film is shot, because each shot writes one.
