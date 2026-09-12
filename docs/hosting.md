# Free hosting and local AI

Living Poster has two deployment modes. Both use the same editor, scene validator, renderer, fonts and exports.

| Feature                   | Browser edition on Vercel                                   | Native local edition                                      |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Storage                   | IndexedDB in this browser profile                           | SQLite on your computer plus browser draft recovery       |
| Password                  | None; there is no server account                            | Choose an owner password on first Save                    |
| Sharing                   | Compressed immutable URL fragment; copies cannot be revoked | Revocable snapshot URL served by the running local server |
| AI                        | Explicit browser connection to your local Ollama            | Authenticated Node API calls your local Ollama            |
| Offline HTML / PNG / JSON | Included                                                    | Included                                                  |

## Vercel deployment

The public GitHub repository is linked to the `living-poster` project in the owner's free Hobby account. Git pushes to `main` build production. Build configuration is checked into `vercel.json`:

```sh
npm ci
npm run build:hosted
```

The output is `dist/hosted`, with static assets, fonts and a standalone player. No cloud database, model endpoint, function, paid storage integration or API key is provisioned. Vercel's [Hobby plan](https://vercel.com/docs/plans/hobby) is intended for personal, noncommercial projects and has free usage limits. This project is a personal portfolio tool. No upgrade or payment method is required by the application.

To reproduce deployment in another account, import the repository into Vercel and retain its checked-in settings. For a CLI deployment, run `vercel link` for your own project and `vercel --prod`. `.vercel/`, environment files, user databases, and local test outputs are excluded from Git and uploads.

## Connect free local AI from the website

1. Install [Ollama](https://ollama.com/download) and run `ollama pull qwen3:4b`. This downloads local model weights, not a paid API subscription.
2. Open **Studio settings → Optional local AI** on your deployed website. The setup disclosure shows the exact origin to allow. Prefer the production origin; do not allow all websites with a wildcard.
3. Add that origin to `OLLAMA_ORIGINS`, preserving any other origins you deliberately configured. Fully quit and restart Ollama so it reads the variable. Keep Ollama bound to loopback; public network exposure is unnecessary.
4. Press **Connect local Ollama**. Allow local-network access if your browser requests it. The default address is `http://127.0.0.1:11434` and the default model is `qwen3:4b`.

On Windows, configure `OLLAMA_ORIGINS` in **Edit environment variables for your account**. On macOS/Linux, use the environment configuration for your Ollama installation. The [official Ollama FAQ](https://docs.ollama.com/faq) covers platform-specific setup. Modern browsers may require [local-network permission](https://developer.chrome.com/blog/local-network-access); browser support varies. The application reports a failed connection and leaves all manual tools usable.

Connection is explicit on each page session; loading the editor or a shared poster does not probe localhost. Model requests stay between your browser and your own Ollama. Cloud model names, remote origins, redirected endpoints and cloud-backed model metadata are rejected. Reloading during inference marks interrupted work as indeterminate; it does not silently resend prompts.

If this browser cannot connect to loopback, run the native local edition with `npm run build` and `npm start`. It uses the same free model through a Node service and works without browser-to-Ollama CORS.

## Password and backups

The hosted edition has no password and does not share a password with localhost. For a new native local installation, press **Save** and create your own password. There is no default password. Existing passwords are stored as salted hashes and cannot be recovered as plain text.

Browser library records belong to the current site origin and browser profile. Private browsing, another browser, another device or a preview deployment has a different library. Export editable JSON regularly to retain a portable backup. Share links contain only the chosen scene snapshot and title, not your drafts, history, AI instructions or password data.
