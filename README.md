# Living Poster

A typography instrument where words float, orbit, ripple, scatter, attract, and give your pointer some space.

![The Living Poster studio](docs/assets/studio.png)

[Watch the 60-second demo](docs/assets/living-poster-demo.mp4) · [Explore the six example compositions](tests/core-artifacts/gallery.png)

Living Poster runs on your computer. The editor, persistent projects, revision history, read-only presentations, PNG exports, self-contained HTML exports, and real local AI editing require **no subscription, API key, paid service, or usage credits**. AI uses Ollama with a locally installed model. There is no cloud model fallback.

## Run it

Requirements: Node.js 24 or newer and npm. For AI editing, install [Ollama](https://ollama.com/download) and download the free local model:

```sh
ollama pull qwen3:4b
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4317**. Choose a starting poster and start editing. Use **Save** to create your local owner password; the same password protects projects, history, shares, and AI requests on this installation. It is stored as a salted hash, never in exported posters or source code.

Qwen3 4B takes approximately 2.5 GB of download space. A compatible GPU makes local edits faster; the application also supports CPU inference. Manual editing and exports work without Ollama. The interface explains when the local model is unavailable instead of substituting canned AI responses.

During development:

```sh
npm run dev
```

Open http://127.0.0.1:5175. The API runs on port 4317. The checked-in fonts are available immediately; run `npm run build` once to generate the standalone player required by animated HTML export. On Windows, `powershell -ExecutionPolicy Bypass -File scripts/start.ps1` also installs missing dependencies, builds, and starts the production application.

## Make a poster

1. Choose one of six editable compositions: Gravity, Panic / Return, After Hours, Frequency, Small Worlds, or Personal Space.
2. Edit wording in the inspector. Click or Shift-click layers on the canvas or layer list. Drag to position them; use arrow keys for 1-unit nudges, or Shift+arrow for 10.
3. Add one of six procedural motions, set its parameters, and scrub the timeline. Changes always affect base layout independently of the animation.
4. Describe a change in the local AI composer. Valid edits apply as one undoable operation and highlight affected layers. Material ambiguity asks for clarification; unsupported requests explain an alternative.
5. Save revisions, share a read-only snapshot, or download a PNG, scene JSON, or animated HTML file.

Ctrl/Cmd+Z undoes manual and AI edits. Ctrl/Cmd+Shift+Z redoes. Delete removes the selected layer outside text fields. Escape cancels an unfinished drag. Interface controls are keyboard-accessible; reduced-motion preferences start playback paused.

## What is local, and what is shareable?

Browser recovery uses IndexedDB. Persistent projects, revisions, password/session hashes, private instructions, and share snapshots use `data/living-poster.sqlite`. The entire `data/` directory is Git-ignored. Back it up to preserve your installation; stop the server before copying it, or use SQLite's supported backup tooling.

A share URL points to an immutable read-only snapshot served by **your running server**. A localhost link works on your own computer. For another person to open it, your server must be reachable from their device. This application does not silently upload posters or provision paid hosting. For effortless sharing without running a server, send the downloaded HTML file: it includes its renderer and fonts and opens offline.

For deliberate LAN hosting, set `LP_HOST=0.0.0.0` and `LP_PUBLIC_HOST` to the computer's LAN IP or hostname. Complete owner setup on localhost first. Restart the server, then open the configured address at port 4317. Keep authoring access protected by your password. Public internet deployment is outside the tested configuration. The shipped server supports native localhost and explicitly configured LAN access; downloaded HTML is the portable sharing format.

Revoking a share prevents future requests to that URL. It cannot retract a file someone already downloaded.

## Configuration

Copy `.env.example` to `.env` and edit it when needed. The default setup needs no environment file.

| Variable         | Default                  | Purpose                                                         |
| ---------------- | ------------------------ | --------------------------------------------------------------- |
| `PORT`           | `4317`                   | Local application port                                          |
| `LP_HOST`        | `127.0.0.1`              | Server bind address                                             |
| `LP_PUBLIC_HOST` | unset                    | One explicitly allowed LAN/reverse-proxy hostname, without port |
| `LP_DATA_DIR`    | `./data`                 | SQLite data directory                                           |
| `OLLAMA_URL`     | `http://127.0.0.1:11434` | Loopback Ollama origin; remote endpoints are rejected           |
| `OLLAMA_MODEL`   | `qwen3:4b`               | Installed local model; cloud-backed models are rejected         |

Do not put passwords, databases, or session cookies in Git. `.env` and local data are excluded. There is no OpenAI, Supabase, or paid generation SDK in the application.

## Verify

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run eval:local
npm run bench
```

The unit/integration suites use controlled test adapters for transport failures and race conditions; the live evaluation command uses your actual local Ollama model. No test invokes a paid API. Browser tests use a fresh isolated data directory. See [evaluation results](docs/evaluation.md) for actual measurements and the separate human-review status.

## Release boundaries

- One 1080×1350 artboard, a 2–10 second looping timeline, text and rectangle/ellipse layers.
- Six bundled font faces from Space Grotesk, Fraunces, and IBM Plex Mono. Font licenses and exact asset hashes live in `apps/web/public/fonts`.
- Supported Latin typography, explicit line breaks and a consistent per-letter layout. Complex-script shaping, cross-letter ligatures and custom fonts are outside this release.
- Bounded procedural motion, not a physics simulation. Motion can be constrained near artboard edges.
- Replay is deterministic with the same renderer, fonts, scene, time, and recorded/fixed pointer input. Live pointer movement is explicitly an input. OS/browser antialiasing can differ.
- PNG and animated HTML export are included. Video export is a future enhancement; the portfolio demo is a screen recording of the application.

## Design and engineering

- [Scene format and motion rules](docs/scene-format.md)
- [Architecture and reliability](docs/architecture.md)
- [Evaluation and performance](docs/evaluation.md)
- [Portfolio case study](docs/case-study.md)
- [60-second demo](docs/demo-script.md)
- [Original plan](docs/superpowers/plans/2026-09-13-living-poster.md), superseded where necessary by the [free local implementation contract](docs/build-contract.md)

## License

Application code: MIT. Bundled fonts retain their SIL Open Font License notices. Ollama and model weights are obtained separately under their own licenses; Qwen3's selected model is published with Apache 2.0 license material. No model weights or user data are committed to this repository.
