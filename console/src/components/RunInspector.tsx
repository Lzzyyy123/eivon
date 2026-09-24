import { t } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { api, downloadArtifact } from "../api";
import type { Run } from "../api";

type RunDetail = Run & { checkpoint?: { waiting?: Record<string, unknown> }; snapshot?: { root: { name: string }; resources: Record<string, { name: string; version: number }> } };
type Event = { sequence: number; type: string; data: Record<string, unknown> };
const stopped = new Set(["completed", "failed", "cancelled", "waiting_input", "waiting_approval"]);

export function RunInspector({ runId, onSettled }: { runId: string; onSettled?: () => void }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [response, setResponse] = useState("{}");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [artifacts, setArtifacts] = useState<{ id: string; name: string; size: number }[]>([]);
  const notified = useRef("");
  useEffect(() => {
    if (run && ["completed", "failed", "cancelled"].includes(run.status) && notified.current !== run.id) {
      notified.current = run.id; onSettled?.();
    }
  }, [run, onSettled]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let sequence = 0;
    setRun(null); setEvents([]); setArtifacts([]); setError("");
    async function poll() {
      try {
        const [current, next] = await Promise.all([
          api<RunDetail>(`/runs/${runId}`, { signal: controller.signal }),
          api<{ items: Event[] }>(`/runs/${runId}/events?after=${sequence}&limit=500`, { signal: controller.signal }),

        ]);
        // Fetch files after status so a terminal response cannot race an earlier file listing.
        const files = await api<{ items: { id: string; name: string; size: number }[] }>(`/runs/${runId}/artifacts`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setRun(current); setArtifacts(files.items);
        if (next.items.length) {
          sequence = next.items[next.items.length - 1].sequence;
          setEvents((previous) => [...previous, ...next.items]);
        }
        if (!stopped.has(current.status) || sequence < current.event_sequence) timer = window.setTimeout(poll, 400);
      } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
    }
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [runId, revision]);

  async function act(action: "resume" | "cancel", approved?: boolean) {
    if (!run) return;
    setBusy(true); setError("");
    try {
      const answer = action === "cancel" ? {} : approved === undefined ? JSON.parse(response) : { approved };
      if (action === "resume" && (answer === null || Array.isArray(answer) || typeof answer !== "object")) throw new Error(t("Response must be a JSON object"));
      await api(`/runs/${runId}/${action}`, { method: "POST", body: action === "resume" ? JSON.stringify({ expected_sequence: run.event_sequence, response: answer }) : undefined });
      setRevision((value) => value + 1);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const waiting = run?.checkpoint?.waiting;
  const liveText = events.filter((event) => event.type === "message.delta").map((event) => String(event.data.text || "")).join("");
  return <section className="run-inspector settings-card" aria-label={t("Run details")}>
    <div className="toolbar"><div><h3>{run?.snapshot?.root.name || t("Run")}</h3><small className="mono">{runId}</small></div><span className="badge" role="status">{t(run?.status || "loading")}</span></div>
    {error && <div className="notice error" role="alert">{error}<button className="text-button" onClick={() => setRevision((value) => value + 1)}>{t("Refresh run")}</button></div>}
    {run?.error && <div className="notice error">{run.error}</div>}
    {run?.status === "waiting_input" && <form onSubmit={(e) => { e.preventDefault(); void act("resume"); }}><h4>{String(waiting?.question || t("Provide input"))}</h4><details><summary>{t("Required input schema")}</summary><pre>{JSON.stringify(waiting?.input_schema, null, 2)}</pre></details><label>{t("Response JSON")}<textarea value={response} onChange={(e) => setResponse(e.target.value)} /></label><button className="button" disabled={busy}>{t("Resume workflow")}</button></form>}
    {run?.status === "waiting_approval" && <div className="approval-card"><h4>{t("Approve")}{" "}{String(waiting?.tool || t("tool execution"))}</h4><pre>{JSON.stringify(waiting?.arguments, null, 2)}</pre><div><button className="button" disabled={busy} onClick={() => void act("resume", true)}>{t("Approve")}</button><button className="text-button" disabled={busy} onClick={() => void act("resume", false)}>{t("Decline")}</button></div></div>}
    {run && !["completed", "failed", "cancelled"].includes(run.status) && <button className="text-button" disabled={busy} onClick={() => void act("cancel")}>{t("Cancel run")}</button>}
    {run && !stopped.has(run.status) && liveText && <div aria-live="polite"><h4>{t("Live response")}</h4><pre>{liveText}</pre></div>}
    {artifacts.length > 0 && <section aria-label={t("Generated files")}><h4>{t("Generated files")}</h4><ul>{artifacts.map((file) => <li key={file.id}><a href={`/api/v1/artifacts/${encodeURIComponent(file.id)}/download`} download onClick={(event) => { event.preventDefault(); void downloadArtifact(file.id, file.name).catch((e) => setError(e.message)); }}>{file.name}</a> <small>{file.size} {t("bytes")}</small></li>)}</ul></section>}
    {run?.output && <div><h4>{t("Output")}</h4><pre data-testid="run-output">{typeof run.output.text === "string" ? run.output.text : JSON.stringify(run.output, null, 2)}</pre></div>}
    <details><summary>{t("Release dependencies · v")}{run?.resource_version}</summary><ul>{Object.entries(run?.snapshot?.resources || {}).map(([key, item]) => <li key={key}>{item.name} {t("· v")}{item.version}</li>)}</ul></details>
    <details open><summary>{t("Execution timeline ·")}{" "}{events.length} {t("events")}</summary><ol className="run-events">{events.map((event) => <li key={event.sequence}><strong>{event.type}</strong><pre>{JSON.stringify(event.data, null, 2)}</pre></li>)}</ol></details>
  </section>;
}
