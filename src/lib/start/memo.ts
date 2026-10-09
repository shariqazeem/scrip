/**
 * THE START'S MARK — kept apart from the builders so the stub a browser draws can read it
 * without the token and system program code that builds a start.
 *
 * A start that counted a first payment carries this memo (`./instructions.ts`); the memo program
 * logs it, which is how the indexer knows that a first save's arrival was the start itself
 * (`lib/ledger/attribute.ts`), and how a stranger reading the transaction knows what it was.
 */
export const START_MEMO = "scrip:start:v1";

/** Whether a cached receipt's attributions include the start's own first payment. */
export function startedWith(attributedJson: string): boolean {
  try {
    return (JSON.parse(attributedJson) as Array<{ start?: boolean }>).some((a) => a.start === true);
  } catch {
    return false;
  }
}
