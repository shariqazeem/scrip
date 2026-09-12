import { clusterConfig } from "@/lib/solana/cluster";

/**
 * Names the settlement cluster. A devnet build is labelled as such, in `--warn`, because a
 * devnet balance is a real on-chain number worth nothing and a product that lets that read as
 * money is lying in the corner of every screen.
 *
 * The dot is deliberately NOT green: green means a settled payment here, and a network status
 * light is not a money outcome.
 */
export function NetworkChip() {
  const { label, isMainnet } = clusterConfig();
  return (
    <span className={`ctx-pill${isMainnet ? "" : " is-test"}`} title={label}>
      <span className="ctx-dot" aria-hidden />
      {label}
    </span>
  );
}
