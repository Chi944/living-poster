import { useState } from "react";
import { Cable, Unplug } from "lucide-react";
import { api, post, type Capabilities } from "./api";
import "./hosted-connector.css";

export function HostedConnector({
  capabilities,
  onChanged,
}: {
  capabilities: Capabilities;
  onChanged: () => void | Promise<void>;
}) {
  const [url, setUrl] = useState(
    capabilities.ai.connector?.url ?? "http://127.0.0.1:11434",
  );
  const [model, setModel] = useState(
    capabilities.ai.connector?.model ?? "qwen3:4b",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const connected = capabilities.ai.available;
  async function connect() {
    setBusy(true);
    setMessage("");
    try {
      const result = await post<{ available: boolean; reason?: string }>(
        "/ai/connector",
        { url, model },
      );
      setMessage(
        result.available
          ? "Connected. Language edits run on your computer; no paid AI service is used."
          : (result.reason ?? "The local model could not connect."),
      );
      await onChanged();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The local model could not connect.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hosted-connector" aria-label="Local AI connection">
      <div className="hosted-connector-heading">
        <Cable size={17} />
        <strong>Optional local AI</strong>
        <span>{connected ? "Connected" : "Disconnected"}</span>
      </div>
      <p className="small-note">
        Connect Ollama on your own computer to edit with words. This website
        contacts your local network only after you press Connect. You can use
        every manual tool without connecting.
      </p>
      <div className="hosted-connector-fields">
        <label>
          Ollama address
          <input
            aria-label="Ollama address"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            disabled={busy || connected}
            spellCheck={false}
          />
        </label>
        <label>
          Installed model
          <input
            aria-label="Installed Ollama model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            disabled={busy || connected}
            spellCheck={false}
          />
        </label>
      </div>
      <details>
        <summary>Set up the free connection</summary>
        <ol>
          <li>
            Install Ollama and run <code>ollama pull qwen3:4b</code> in a
            terminal.
          </li>
          <li>
            Set the <code>OLLAMA_ORIGINS</code> environment variable to{" "}
            <code>{window.location.origin}</code>, then fully quit and restart
            Ollama.
          </li>
          <li>
            Press Connect below. Allow local-network access if your browser
            asks.
          </li>
        </ol>
        <p className="small-note">
          Only a loopback address and a locally installed model are accepted.
          Cloud models are disabled. If your browser blocks the connection, the
          downloadable local edition includes the same editor and local AI.
        </p>
      </details>
      {connected ? (
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/ai/connector", { method: "DELETE" });
              setMessage(
                "Disconnected on this page. Pending edits here were stopped.",
              );
              await onChanged();
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Could not disconnect.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Unplug size={14} />
          Disconnect local AI
        </button>
      ) : (
        <button
          className="button"
          disabled={busy}
          onClick={() => void connect()}
        >
          <Cable size={14} />
          {busy ? "Connecting…" : "Connect local Ollama"}
        </button>
      )}
      {message && (
        <p className="small-note" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
