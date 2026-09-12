import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildServer } from "../apps/api/src/server";
const dataDir = await mkdtemp(join(tmpdir(), "living-poster-browser-"));
const server = await buildServer({
  dataDir,
  staticDir: resolve("dist/web"),
  provider: {
    available: async () => ({
      available: false,
      reason:
        "Browser suite uses controlled transport; eval:local exercises the real model.",
    }),
    generate: async () => {
      throw new Error("Browser tests must explicitly control AI transport.");
    },
  },
});
await server.listen({ host: "127.0.0.1", port: 4328 });
async function close() {
  await server.close();
  await rm(dataDir, { recursive: true, force: true });
  process.exit(0);
}
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
