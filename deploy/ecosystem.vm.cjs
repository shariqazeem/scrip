/**
 * pm2 on the founder's VM (Ubuntu, Node 22 via nvm). Three processes, all reading
 * /home/ubuntu/scrip/.env.local: the web app on :3300 behind nginx, and TWO keepers.
 *
 * The second keeper holds a different key, reports on a different port, and is a BACKUP: it
 * acts only on money that has already waited 90 seconds, which never happens while the first is
 * up. Until 8 October the two raced for every save, and with many people saving at once half of
 * every round's fees bought a transaction that lost. Either can save any register — the program
 * refuses a second sweep of the same arrival — so the backup is the proof that no one keeper is
 * trusted, and costs nothing until the day it is needed.
 */
const NODE_BIN = "/home/ubuntu/.nvm/versions/node/v22.23.2/bin";
module.exports = {
  apps: [
    {
      name: "scrip-web",
      cwd: "/home/ubuntu/scrip",
      script: `${NODE_BIN}/npx`,
      args: "next start -p 3300",
      env: { NEXT_DIST_DIR: ".next-build", NODE_ENV: "production", PATH: `${NODE_BIN}:${process.env.PATH}` },
      max_memory_restart: "600M",
    },
    {
      name: "scrip-keeper",
      cwd: "/home/ubuntu/scrip",
      script: "/usr/bin/bash",
      // Named explicitly rather than inherited from .env.local: a keeper must never be able
      // to come up holding the upgrade authority because a stale env file still said so.
      args: [
        "-lc",
        `set -a; source /home/ubuntu/scrip/.env.local; set +a; export SCRIP_KEEPER_KEYPAIR=/home/ubuntu/scrip/anchor/.keys/keeper1.json; exec ${NODE_BIN}/npx tsx src/keeper/index.ts`,
      ],
      env: { NODE_ENV: "production", PATH: `${NODE_BIN}:${process.env.PATH}` },
      max_memory_restart: "400M",
      restart_delay: 10000,
    },
    {
      name: "scrip-keeper-2",
      cwd: "/home/ubuntu/scrip",
      script: "/usr/bin/bash",
      // Its own key, its own health port, a slower poll, and the patience of a backup.
      args: [
        "-lc",
        `set -a; source /home/ubuntu/scrip/.env.local; set +a; export SCRIP_KEEPER_KEYPAIR=/home/ubuntu/scrip/anchor/.keys/keeper2.json KEEPER_HEALTH_PORT=8788 KEEPER_POLL_SECONDS=60 KEEPER_BACKUP_AFTER_SECONDS=90; exec ${NODE_BIN}/npx tsx src/keeper/index.ts`,
      ],
      env: { NODE_ENV: "production", PATH: `${NODE_BIN}:${process.env.PATH}` },
      max_memory_restart: "400M",
      restart_delay: 15000,
    },
  ],
};
