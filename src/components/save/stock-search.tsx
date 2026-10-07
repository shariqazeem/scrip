"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { PickerStock } from "@/lib/save/catalogue";

/**
 * EVERY STOCK A SAVE CAN BUY, BY THE NAME A PERSON SAYS.
 *
 * The catalogue is curated by rules (`scripts/stock-catalogue.ts`): three issuers whose
 * documents Scrip has read, a real route at $5 and $100, no restricted transfers. A row is
 * the company first, then the ticker and the issuer in small type, and "Saves automatically"
 * on the eleven the chain can price.
 */
export function StockSearch({
  open,
  stocks,
  selected,
  readAt,
  onPick,
  onClose,
}: {
  open: boolean;
  stocks: readonly PickerStock[];
  selected: string;
  readAt: string;
  onPick: (mint: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ("");
      requestAnimationFrame(() => input.current?.focus());
    } else if (!open && d.open) d.close();
  }, [open]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return stocks;
    return stocks.filter((x) => x.name.toLowerCase().includes(s) || x.ticker.toLowerCase().startsWith(s) || x.symbol.toLowerCase().startsWith(s) || x.issuer.toLowerCase() === s);
  }, [q, stocks]);

  return (
    <dialog ref={ref} className="sp-save-dialog sp-save-search" aria-label="Find a stock" onClose={onClose} onCancel={onClose}>
      <div className="sp-save-dialog-head">
        <label className="sp-save-search-field">
          <Search size={16} strokeWidth={2} aria-hidden />
          <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a company or ticker" aria-label="Search a company or ticker" />
        </label>
        <button type="button" className="sp-save-icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <ul className="sp-save-search-list" role="listbox" aria-label="Stocks">
        {shown.map((s) => (
          <li key={s.mint}>
            <button
              type="button"
              role="option"
              aria-selected={s.mint === selected}
              className={`sp-save-search-row${s.mint === selected ? " is-selected" : ""}`}
              onClick={() => {
                onPick(s.mint);
                onClose();
              }}
            >
              <span className="name">{s.name}</span>
              <span className="meta">
                {s.ticker} · {s.issuer}
              </span>
              {s.auto ? <span className="auto">Saves automatically</span> : null}
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="sp-save-search-empty">No stock by that name routes cleanly right now.</li> : null}
      </ul>
      <p className="sp-save-search-foot">
        {stocks.length} stocks from xStocks, Backpack and Ondo that route at $5 and $100 without moving the price, read {readAt}. Not
        offered to US persons.
      </p>
    </dialog>
  );
}
