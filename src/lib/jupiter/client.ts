import { PublicKey, TransactionInstruction, type AddressLookupTableAccount, type Connection } from "@solana/web3.js";
import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * JUPITER — the route. The keeper and the intake both ask it for a quote and for the
 * instructions that execute it, then splice those between the program's own instructions.
 *
 * The program never CPIs Jupiter. A route's accounts are not known until the quote exists,
 * and a swap that runs inside a program is a swap that fails in the worst place: mid-release,
 * with somebody's money in an escrow. As top-level instructions, with the program checking
 * the balances before and after, the route is the keeper's discretion and nothing else is.
 *
 * `lite-api.jup.ag` is the keyless tier; `api.jup.ag` takes `JUPITER_API_KEY`.
 */

const BASE = () => process.env.JUPITER_API_URL?.replace(/\/+$/, "") || (process.env.JUPITER_API_KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag");

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
  const key = process.env.JUPITER_API_KEY?.trim();
  if (key) h["x-api-key"] = key;
  return h;
}

export type Quote = {
  readonly inputMint: string;
  readonly outputMint: string;
  readonly inAmount: string;
  readonly outAmount: string;
  readonly otherAmountThreshold: string;
  readonly slippageBps: number;
  readonly priceImpactPct: string;
  readonly routePlan: ReadonlyArray<{ swapInfo: { label?: string; ammKey: string }; percent: number }>;
  readonly contextSlot?: number;
  readonly raw: unknown;
};

export async function quote(input: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
  maxAccounts?: number;
  onlyDirectRoutes?: boolean;
}): Promise<Outcome<Quote>> {
  const p = new URLSearchParams({
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amount: input.amount.toString(),
    slippageBps: String(input.slippageBps),
    swapMode: "ExactIn",
    restrictIntermediateTokens: "true",
  });
  if (input.maxAccounts) p.set("maxAccounts", String(input.maxAccounts));
  if (input.onlyDirectRoutes) p.set("onlyDirectRoutes", "true");
  let res: Response;
  try {
    res = await fetch(`${BASE()}/swap/v1/quote?${p}`, { headers: headers(), cache: "no-store" });
  } catch (err) {
    return held(`Jupiter could not be reached (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return held(`Jupiter refused the quote (${res.status}${text ? `: ${text.slice(0, 160)}` : ""}).`);
  }
  const j = (await res.json()) as Record<string, unknown>;
  if (typeof j.outAmount !== "string") return held("Jupiter returned a quote with no amount.");
  return ok({
    inputMint: String(j.inputMint),
    outputMint: String(j.outputMint),
    inAmount: String(j.inAmount),
    outAmount: j.outAmount,
    otherAmountThreshold: String(j.otherAmountThreshold),
    slippageBps: Number(j.slippageBps),
    priceImpactPct: String(j.priceImpactPct ?? "0"),
    routePlan: (j.routePlan as Quote["routePlan"]) ?? [],
    contextSlot: typeof j.contextSlot === "number" ? j.contextSlot : undefined,
    raw: j,
  });
}

export type SwapInstructions = {
  readonly computeBudget: TransactionInstruction[];
  readonly setup: TransactionInstruction[];
  readonly swap: TransactionInstruction;
  readonly cleanup: TransactionInstruction | null;
  readonly lookupTableAddresses: string[];
};

type WireIx = {
  programId: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
};

function fromWire(ix: WireIx): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, "base64"),
  });
}

/**
 * The instructions for a quote, as instructions rather than a serialized transaction, so
 * they can sit between `begin_sweep` and `finish_sweep`, or between `fund_payout` and
 * `release_payout`. `destinationTokenAccount` sends the output straight to the account the
 * program will check — the owner's own, or the escrow.
 */
export async function swapInstructions(input: {
  quote: Quote;
  userPublicKey: PublicKey;
  destinationTokenAccount: PublicKey;
}): Promise<Outcome<SwapInstructions>> {
  let res: Response;
  try {
    res = await fetch(`${BASE()}/swap/v1/swap-instructions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        quoteResponse: input.quote.raw,
        userPublicKey: input.userPublicKey.toBase58(),
        destinationTokenAccount: input.destinationTokenAccount.toBase58(),
        wrapAndUnwrapSol: false,
        // The caller sets the compute budget for the whole transaction.
        dynamicComputeUnitLimit: false,
        skipUserAccountsRpcCalls: true,
      }),
      cache: "no-store",
    });
  } catch (err) {
    return held(`Jupiter could not be reached (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return held(`Jupiter refused the swap (${res.status}${text ? `: ${text.slice(0, 160)}` : ""}).`);
  }
  const j = (await res.json()) as {
    computeBudgetInstructions?: WireIx[];
    setupInstructions?: WireIx[];
    swapInstruction?: WireIx;
    cleanupInstruction?: WireIx | null;
    addressLookupTableAddresses?: string[];
    error?: string;
  };
  if (!j.swapInstruction) return held(`Jupiter returned no swap instruction${j.error ? ` (${j.error})` : ""}.`);
  return ok({
    computeBudget: (j.computeBudgetInstructions ?? []).map(fromWire),
    setup: (j.setupInstructions ?? []).map(fromWire),
    swap: fromWire(j.swapInstruction),
    cleanup: j.cleanupInstruction ? fromWire(j.cleanupInstruction) : null,
    lookupTableAddresses: j.addressLookupTableAddresses ?? [],
  });
}

/** Resolve the lookup tables a route needs, so a versioned transaction can be compiled. */
export async function lookupTables(conn: Connection, addresses: readonly string[]): Promise<Outcome<AddressLookupTableAccount[]>> {
  if (addresses.length === 0) return ok([]);
  try {
    const infos = await conn.getMultipleAccountsInfo(addresses.map((a) => new PublicKey(a)), "confirmed");
    const out: AddressLookupTableAccount[] = [];
    const { AddressLookupTableAccount: ALT } = await import("@solana/web3.js");
    infos.forEach((info, i) => {
      if (!info) return;
      out.push(new ALT({ key: new PublicKey(addresses[i]!), state: ALT.deserialize(info.data) }));
    });
    if (out.length !== addresses.length) return held("One of the route's lookup tables could not be read.");
    return ok(out);
  } catch (err) {
    return held(`Could not read the route's lookup tables (${err instanceof Error ? err.message : String(err)}).`);
  }
}

/** A USD price per whole token, from Jupiter's price API. For DISPLAY, never for settlement. */
export async function prices(mints: readonly string[]): Promise<Outcome<Map<string, number>>> {
  if (mints.length === 0) return ok(new Map());
  let res: Response;
  try {
    res = await fetch(`${BASE()}/price/v3?ids=${mints.join(",")}`, { headers: headers(), cache: "no-store" });
  } catch (err) {
    return held(`Jupiter's price API could not be reached (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!res.ok) return held(`Jupiter's price API refused (${res.status}).`);
  const j = (await res.json()) as Record<string, { usdPrice?: number } | undefined>;
  const out = new Map<string, number>();
  for (const m of mints) {
    const p = j[m]?.usdPrice;
    if (typeof p === "number" && Number.isFinite(p) && p > 0) out.set(m, p);
  }
  return ok(out);
}
