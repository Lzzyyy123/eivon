import { t } from "../i18n";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import type { Resource, Run } from "../api";
import { RunInspector } from "./RunInspector";

type Conversation = { id: string; agent_id: string; title: string; context: Record<string, unknown>; active_run_id: string | null };
type Turn = Run & { input: { message?: string } };
type ConversationDetail = Conversation & { runs: Turn[] };

export function Playground() {
  const [agents, setAgents] = useState<Resource[]>([]);
  const [agent, setAgent] = useState("");
  const [sessions, setSessions] = useState<Conversation[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [session, setSession] = useState<ConversationDetail | null>(null);
  const [message, setMessage] = useState("");
  const [context, setContext] = useState("{}");
  const [runId, setRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshSessions = useCallback(async () => {
    const result = await api<{ items: Conversation[]; total: number }>(`/sessions?offset=${offset}&limit=25`);
    setSessions(result.items); setTotal(result.total);
  }, [offset]);
  useEffect(() => { void refreshSessions().catch((e) => setError(e.message)); }, [refreshSessions]);
  useEffect(() => {
    const controller = new AbortController();
    async function loadAgents() {
      const all: Resource[] = [];
      for (let offset = 0; ; offset += 200) {
        const result = await api<{ items: Resource[]; total: number }>(`/resources?kind=agent&offset=${offset}&limit=200`, { signal: controller.signal });
        all.push(...result.items.filter((item) => item.active_version));
        if (offset + result.items.length >= result.total || !result.items.length) break;
      }
      if (!controller.signal.aborted) { setAgents(all); setAgent((previous) => previous || all[0]?.id || ""); }
    }
    void loadAgents().catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  async function openSession(id: string) {
    setBusy(true); setError("");
    try {
      const item = await api<ConversationDetail>(`/sessions/${id}`);
      setSession(item); setAgent(item.agent_id); setContext(JSON.stringify(item.context, null, 2));
      setRunId(item.active_run_id || item.runs.at(-1)?.id || "");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const sessionId = session?.id;
  const settled = useCallback(() => {
    if (!sessionId) return;
    void api<ConversationDetail>(`/sessions/${sessionId}`).then((item) => {
      setSession((previous) => previous?.id === item.id ? item : previous);
    }).catch((e) => setError(e.message));
    void refreshSessions().catch((e) => setError(e.message));
  }, [sessionId, refreshSessions]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy || session?.active_run_id || !message.trim()) return;
    setBusy(true); setError("");
    try {
      let current = session;
      if (!current) {
        const data = JSON.parse(context);
        if (!data || Array.isArray(data) || typeof data !== "object") throw new Error(t("Business context must be a JSON object"));
        const created = await api<Conversation>("/sessions", { method: "POST", body: JSON.stringify({ agent_id: agent, title: message.slice(0, 80), context: data }) });
        current = { ...created, runs: [] }; setSession(current);
      }
      const created = await api<Run>("/runs", { method: "POST", body: JSON.stringify({ resource_id: current.agent_id, session_id: current.id, message, idempotency_key: crypto.randomUUID() }) });
      setRunId(created.id); setMessage("");
      setSession(await api<ConversationDetail>(`/sessions/${current.id}`));
      await refreshSessions();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section>
    <div className="toolbar"><div><span className="eyebrow">{t("LIVE RUNTIME")}</span><h2 className="section-title">{t("Playground")}</h2></div><button className="button" disabled={busy} onClick={() => { setSession(null); setRunId(""); setMessage(""); setContext("{}"); setError(""); }}>{t("New conversation")}</button></div>
    {error && <div className="notice error" role="alert">{error}</div>}
    <div className="conversation-layout"><nav className="workflow-list" aria-label={t("Saved conversations")}><div className="chat-head">{t("CONVERSATIONS")}</div>{sessions.map((item) => <button key={item.id} disabled={busy} className={`workflow-item ${item.id === session?.id ? "active" : ""}`} onClick={() => void openSession(item.id)}><strong>{item.title}</strong><small>{item.active_run_id ? t("Active run") : t("Saved")}</small></button>)}{!sessions.length && <p className="muted">{t("Your conversations appear here.")}</p>}<div className="workflow-actions"><button className="text-button" disabled={!offset} onClick={() => setOffset((value) => Math.max(0, value - 25))}>{t("Previous")}</button><button className="text-button" disabled={offset + sessions.length >= total} onClick={() => setOffset((value) => value + 25)}>{t("Next")}</button></div></nav>
      <div><section className="chat-panel" aria-label={t("Conversation")}><div className="chat-head">{session?.title || t("New conversation")}</div>
        <div className="chat-body conversation-transcript" role="log" aria-label={t("Conversation messages")}>{session?.runs.map((turn) => <article className="conversation-turn" key={turn.id}><div className="user-message"><b>{t("You")}</b><p>{turn.input.message}</p></div>{turn.output?.text ? <div className="assistant-message"><b>{t("Eivon")}</b><p>{String(turn.output.text)}</p></div> : <p className="muted">{turn.status.replaceAll("_", " ")}</p>}<button className="text-button" onClick={() => setRunId(turn.id)}>{t("Inspect turn · v")}{turn.resource_version}</button></article>)}{!session?.runs.length && <p className="muted">{t("Choose a published Agent. Conversations are saved and can be reopened later.")}</p>}</div>
        <form className="composer" onSubmit={(event) => void send(event)}><label>{t("Agent")}<select required disabled={busy || !!session} value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">{t("Choose published Agent")}</option>{session && !agents.some((item) => item.id === session.agent_id) && <option value={session.agent_id}>{t("Saved Agent (unavailable)")}</option>}{agents.map((item) => <option key={item.id} value={item.id}>{item.name} {t("· v")}{item.active_version}</option>)}</select></label>{!session && <details><summary>{t("Business context")}</summary><label>{t("Context JSON")}<textarea value={context} onChange={(e) => setContext(e.target.value)} /></label></details>}<label>{t("Message")}<input required disabled={busy || !!session?.active_run_id} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("Ask your agent something…")} /></label><button className="button" disabled={busy || !!session?.active_run_id || !agent}>{t("Send message")}</button>{session?.active_run_id && <p className="muted">{t("A run is active. Use its controls below to approve, resume or cancel.")}</p>}</form>
      </section>{runId && <RunInspector key={runId} runId={runId} onSettled={settled} />}</div>
    </div>
  </section>;
}
