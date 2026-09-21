"use client";

import { type ReactNode, useState } from "react";

/**
 * TWO WAYS TO PAY A BOOK. In stock: the intake, all of it becomes the asset with a reason on
 * the receipt. In USDC: a normal transfer to their address, and their rule takes its slice.
 * The one the page opens on is the one the link asked for.
 */
export function PayModes({ stock, usdc, initial = "stock", who, assetSymbol, rateOn }: { stock: ReactNode; usdc: ReactNode; initial?: "stock" | "usdc"; who: string; assetSymbol: string; rateOn: boolean }) {
  const [mode, setMode] = useState<"stock" | "usdc">(initial);
  return (
    <div className="sp-pay-modes">
      <div className="sp-pay-mode-row" role="tablist" aria-label="How to pay">
        <button type="button" role="tab" aria-selected={mode === "stock"} className={`sp-pay-mode${mode === "stock" ? " on" : ""}`} onClick={() => setMode("stock")}>
          <span className="t">In stock</span>
          <span className="p">All of it becomes {assetSymbol}, with your reason on the receipt.</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "usdc"} className={`sp-pay-mode${mode === "usdc" ? " on" : ""}`} onClick={() => setMode("usdc")}>
          <span className="t">In USDC</span>
          <span className="p">{rateOn ? `To ${who}'s normal address. Their rule takes its slice.` : `To ${who}'s normal address.`}</span>
        </button>
      </div>
      {mode === "stock" ? stock : usdc}
    </div>
  );
}
