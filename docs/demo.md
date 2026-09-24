# Recording the demo

Two short screen recordings, no voice and no face: the only two moments where money moves.
Everything else in the film is recorded from the live site and edited around them, with
captions in the product's own words. Never speed up or cut the moment a stub prints; if it
waits for a price, keep that too — it is the rule working.

---

## Before you start (10 minutes)

1. **The demo wallet.** In the Phantom browser extension, add an account named "Demo" and send
   it **0.03 SOL**. It needs no USDC: turning the rule on opens its USDC account in the same
   signature. Pick its handle now, for example `shariqdemo`.
2. **The payer.** Phantom on your phone, holding **$10 or more of USDC** and a little SOL.
3. **Hide balances** in Phantom on the phone (tap your total balance, or Settings → Hide balances)
   so no private balance is on screen.
4. **The price is live.** Open `scrip.work/docs/pyth`. Under "Right now", Equity.US.SPY/USD must
   say "a sweep would settle". It does on weekdays, before the opening bell too.
5. **The browser.** Chrome, one window, zoom 125%, bookmarks bar hidden, other tabs closed,
   Do Not Disturb on.
6. **Recording.** Laptop: ⌘⇧5 → record the browser window, or QuickTime → New Screen Recording.
   Phone: its own screen recording (iPhone: Control Center → Screen Recording).

---

## Recording 1 — turning the rule on (about 40 seconds)

1. Start recording the browser window.
2. Open `scrip.work/app/rule`. Leave 10%.
3. Scroll slowly past the worked example to "What this costs". Pause there for two seconds.
4. Connect the **Demo** account. Keep the Phantom popup in the recording.
5. Type the handle.
6. Press **Turn on the rule** and approve in Phantom.
7. Wait until you land on your register and it says the rule is on. Stop.

## Recording 2 — getting paid (about 60 seconds)

Two recordings at the same time: the laptop and the phone.

1. On the laptop, open `scrip.work/app` (the Demo register) and start recording the window.
2. On the phone, start the screen recording.
3. On the phone, in Phantom: Send → USDC → paste the Demo address → **$10** → send.
4. On the laptop, touch nothing. Wait until the stub prints, then ten seconds more.
5. Click the new stub to open its receipt. Scroll slowly to the bottom. Stop both recordings.

## Recording 3, optional — paying in stock (about 40 seconds)

1. Record the window at `scrip.work/app/org/pay`.
2. Pay **@shariqdemo** (your demo handle) **$2** with the reason **"demo payment in stock"**.
3. Sign, and let the receipt with its reason open. Stop.

---

## Then

Put the files in `~/Movies/scrip-demo/` (AirDrop the phone's recording to the Mac) and send
the Demo wallet's address, so the ledger marks it as the team's.

From those recordings and the live site, the edit makes:

- **the pitch film** — about two minutes, captions instead of voice — for the "Pitch Video URL";
- **the technical film** — the sweep transaction instruction by instruction, the four Pyth
  checks, the keepers — for the "Technical Video URL";
- **clips for posts**, each in the same frame as the launch film.

What the film never claims: returns, projections, user counts that are not on the ledger,
anything about a token. If a sentence cannot be checked by opening a page in the film, it
does not go in.
