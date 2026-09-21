import "server-only";

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";

const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

export type SecurityFacts = {
  readonly programId: string;
  readonly cluster: string;
  readonly deployed: boolean;
  readonly programDataAddress: string;
  readonly upgradeAuthority: string | null;
  readonly dataLength: number | null;
  readonly lastDeploySlot: number | null;
  /** sha256 of the built mainnet .so, when the build is on this host. */
  readonly buildSha256: string | null;
  readonly buildBytes: number | null;
};

/**
 * WHAT A JUDGE CAN CHECK: the program id, whether it is deployed, who can upgrade it (a
 * key until the multisig), the on-chain data length, and the hash of the build on this host
 * to compare with a verifiable build. Read from the chain at request time.
 */
export async function securityFacts(cluster: string): Promise<SecurityFacts> {
  const [programData] = PublicKey.findProgramAddressSync([SCRIP_PROGRAM_ID.toBuffer()], BPF_LOADER_UPGRADEABLE);
  let upgradeAuthority: string | null = null;
  let dataLength: number | null = null;
  let lastDeploySlot: number | null = null;
  let deployed = false;
  try {
    const conn = connection();
    const [prog, data] = await Promise.all([conn.getAccountInfo(SCRIP_PROGRAM_ID, "confirmed"), conn.getAccountInfo(programData, "confirmed")]);
    deployed = !!prog?.executable;
    if (data) {
      // ProgramData: 4 (kind) + 8 (slot) + 1 (option) + 32 (authority) + the ELF.
      dataLength = data.data.length - 45;
      lastDeploySlot = Number(data.data.readBigUInt64LE(4));
      upgradeAuthority = data.data[12] === 1 ? new PublicKey(data.data.subarray(13, 45)).toBase58() : null;
      // A local validator loads a program with the default key as authority: nobody holds it.
      if (upgradeAuthority === PublicKey.default.toBase58()) upgradeAuthority = null;
    }
  } catch {
    // unreachable chain: the page says what it could not check
  }
  const so = join(process.cwd(), "anchor", "target", "deploy", cluster === "mainnet-beta" ? "scrip-mainnet.so" : "scrip-devnet.so");
  let buildSha256: string | null = null;
  let buildBytes: number | null = null;
  if (existsSync(so)) {
    const bytes = readFileSync(so);
    buildSha256 = createHash("sha256").update(bytes).digest("hex");
    buildBytes = bytes.length;
  }
  return { programId: SCRIP_PROGRAM_ID.toBase58(), cluster, deployed, programDataAddress: programData.toBase58(), upgradeAuthority, dataLength, lastDeploySlot, buildSha256, buildBytes };
}
