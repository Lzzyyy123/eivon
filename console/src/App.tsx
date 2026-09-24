import { formatDate, setLanguage, t, useLanguage } from "./i18n";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Boxes, Bot, ChartNoAxesCombined, Clock3, FlaskConical, Languages, LayoutDashboard, LibraryBig, LogOut, MessagesSquare, Settings2, UsersRound, Workflow } from "lucide-react";
import { api, ApiRequestError, cancelPendingRequests, setCsrf, setWorkspace } from "./api";
import type { Identity, Run } from "./api";
import { ResourceList } from "./components/ResourceLibrary";
import { Playground } from "./components/Playground";
import { RunHistory } from "./components/RunHistory";
import { WorkflowStudio } from "./components/WorkflowStudio";
import { Evaluations } from "./components/Evaluations";
import { Members, Settings } from "./components/Administration";

type Page = "overview" | "agents" | "resources" | "workflows" | "playground" | "runs" | "evaluations" | "knowledge" | "members" | "settings";

function Button({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button className="button" {...props}>{children}</button>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="badge">{children}</span>; }

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-lockup${compact ? " compact" : ""}`}><img src="/eivon-mark.svg" alt="" /><span className="brand-name">EIVON</span><small>{compact ? t("WORKBENCH") : t("AGENT WORKBENCH")}</small></div>;
}

function LanguageSwitch({ className = "" }: { className?: string }) {
  const language = useLanguage();
  return <label className={`language-switch ${className}`}><Languages size={16} aria-hidden="true" /><span className="sr-only">{t("Interface language")}</span><select aria-label={t("Interface language")} value={language} onChange={(event) => setLanguage(event.target.value as "en" | "zh-CN")}><option value="en">English</option><option value="zh-CN">简体中文</option></select></label>;
}

function rememberWorkspace(identity: Identity) {
  try { sessionStorage.setItem(`eivon.workspace.${identity.user.id}`, identity.workspace_id); } catch { /* Storage is optional. */ }
}

export function App() {
  const language = useLanguage();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>("overview");
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  useEffect(() => { document.title = language === "zh-CN" ? "Eivon · 智能体工作台" : "Eivon · Agent workbench"; }, [language]);
  function adopt(value: Identity) {
    setWorkspace(value.workspace_id); setCsrf(value.csrf_token || ""); rememberWorkspace(value); setIdentity(value); setError("");
  }
  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const setup = await api<{ initialized: boolean }>("/setup");
        if (!setup.initialized) { if (active) setSetupRequired(true); return; }
        try {
          let me = await api<Identity>("/auth/me");
          let saved = ""; try { saved = sessionStorage.getItem(`eivon.workspace.${me.user.id}`) || ""; } catch { /* Optional storage. */ }
          if (saved && saved !== me.workspace_id && me.workspaces.some((item) => item.id === saved)) {
            try { me = await api<Identity>("/auth/me", { headers: { "x-eivon-workspace": saved } }); } catch (e) { if (!(e instanceof ApiRequestError) || e.status !== 403) throw e; }
          }
          if (active) adopt(me);
        } catch (e) {
          if (e instanceof ApiRequestError && e.status === 403) {
            const session = await api<{ csrf_token: string }>("/auth/session");
            if (active) { setCsrf(session.csrf_token); setError(e.message); }
          } else if (!(e instanceof ApiRequestError) || e.status !== 401) throw e;
        }
        if (active) setSetupRequired(false);
      } catch (e) { if (active) { setError((e as Error).message); setSetupRequired(false); } }
    }
    void initialize(); return () => { active = false; };
  }, []);
  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); cancelPendingRequests(); setWorkspace(""); setCsrf(""); setIdentity(null); setError(""); setPage("overview"); }
    catch (e) { setError((e as Error).message); }
  }
  async function switchWorkspace(id: string) {
    if (switching) return;
    setSwitching(true); cancelPendingRequests();
    try { adopt(await api<Identity>("/auth/me", { headers: { "x-eivon-workspace": id } })); setPage("overview"); }
    catch (e) { setError((e as Error).message); }
    finally { setSwitching(false); }
  }
  async function refreshIdentity() {
    try { const value = await api<Identity>("/auth/me"); adopt(value); if (page === "members" && !value.permissions.includes("admin")) setPage("overview"); }
    catch (e) { setError((e as Error).message); }
  }
  if (error) return <main className="center"><div className="settings-card"><div role="alert" className="notice error">{error}</div>{identity && <button className="button" onClick={() => void switchWorkspace("")}>{t("Reload available workspace")}</button>}<button className="text-button" onClick={() => void logout()}>{t("Sign out")}</button></div></main>;
  if (setupRequired === null || switching) return <main className="center"><div className="loading">{t(switching ? "Switching workspace…" : "Loading Eivon…")}</div></main>;
  if (setupRequired) return <AuthCard mode="setup" onComplete={(value) => { adopt(value); setSetupRequired(false); }} />;
  if (!identity) return <AuthCard mode="login" onComplete={adopt} />;
  return <Shell key={`${identity.workspace_id}:${identity.role}`} identity={identity} page={page} setPage={setPage} onLogout={() => void logout()} onWorkspaceChange={(id) => void switchWorkspace(id)} onIdentityRefresh={() => void refreshIdentity()} />;
}

function AuthCard({ mode, onComplete }: { mode: "login" | "setup"; onComplete: (value: Identity) => void }) {
  const [form, setForm] = useState({ setup_token: "", email: "", password: "", name: "", workspace_name: "My workspace" });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); try { const result = await api<Identity>(mode === "setup" ? "/setup" : "/auth/login", { method: "POST", body: JSON.stringify(mode === "setup" ? form : { email: form.email, password: form.password }) }); onComplete(result); } catch (e) { setError((e as Error).message); } }
  return <main className="center auth-screen"><div className="auth-language"><LanguageSwitch /></div><form className="auth-card" onSubmit={submit}><BrandMark /><h1>{t(mode === "setup" ? "Create your workspace" : "Welcome back")}</h1><p className="muted">{t(mode === "setup" ? "Set up the first administrator for this self-hosted instance." : "Sign in to manage your agents.")}</p>{error && <div className="notice error">{error}</div>}{mode === "setup" && <><label>{t("Setup token")}<input required value={form.setup_token} onChange={(e) => setForm({ ...form, setup_token: e.target.value })} /></label><label>{t("Your name")}<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>{t("Workspace name")}<input required value={form.workspace_name} onChange={(e) => setForm({ ...form, workspace_name: e.target.value })} /></label></>}<label>{t("Email")}<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>{t("Password")}<input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><Button type="submit">{t(mode === "setup" ? "Initialize Eivon" : "Sign in")}</Button></form></main>;
}

function Shell({ identity, page, setPage, onLogout, onWorkspaceChange, onIdentityRefresh }: { identity: Identity; page: Page; setPage: (page: Page) => void; onLogout: () => void; onWorkspaceChange: (id: string) => void; onIdentityRefresh: () => void }) {
  const nav: [Page, string, string][] = [["overview", "Overview", "01"], ["agents", "Agents", "02"], ["resources", "Resources", "03"], ["workflows", "Workflows", "04"], ["playground", "Playground", "05"], ["runs", "Run history", "06"], ["evaluations", "Evaluations", "07"], ["knowledge", "Knowledge", "08"], ["members", "Members", "09"], ["settings", "Settings", "10"]];
  const icons = { overview: LayoutDashboard, agents: Bot, resources: Boxes, workflows: Workflow, playground: MessagesSquare, runs: Clock3, evaluations: FlaskConical, knowledge: LibraryBig, members: UsersRound, settings: Settings2 };
  return <div className="app-shell"><aside><BrandMark compact /><label className="workspace-picker">{t("Workspace")}<select aria-label={t("Current workspace")} value={identity.workspace_id} onChange={(e) => onWorkspaceChange(e.target.value)}>{identity.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="nav-section-label">{t("WORKSPACE NAVIGATION")}</div><nav aria-label={t("Main navigation")}>{nav.filter(([key]) => key !== "members" || identity.permissions.includes("admin")).map(([key, name, number]) => { const Icon = icons[key]; return <button key={key} className={`nav-item ${page === key ? "active" : ""}`} onClick={() => setPage(key)} aria-current={page === key ? "page" : undefined}><Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{number}</span>{t(name)}</button>; })}</nav><div className="side-bottom"><div className="avatar">{identity.user.name.slice(0, 1).toUpperCase()}</div><div><strong>{identity.user.name}</strong><small>{identity.user.email}</small></div><button className="logout" title={t("Sign out")} aria-label={t("Sign out")} onClick={onLogout}><LogOut size={17} /></button></div></aside><main className="content"><header><div><span className="eyebrow">{t("CONTROL PLANE / ")}{t(nav.find(([key]) => key === page)?.[1] || "")}</span><h1>{t(nav.find(([key]) => key === page)?.[1] || "")}</h1></div><div className="header-actions"><span className="connection"><i /> {t("Local instance")}</span><Badge>{t(identity.role)}</Badge><LanguageSwitch /></div></header>{page === "overview" && <Overview setPage={setPage} />}{page === "agents" && <ResourceList canWrite={identity.permissions.includes("write")} kind="agent" title={t("Agents")} empty={t("Create an Agent release from model and prompt resources.")} />}{page === "resources" && <ResourceList canWrite={identity.permissions.includes("write")} title={t("Resource library")} />}{page === "workflows" && <WorkflowStudio />}{page === "playground" && <Playground />}{page === "runs" && <RunHistory />}{page === "evaluations" && <Evaluations identity={identity} />}{page === "knowledge" && <Knowledge />}{page === "members" && <Members identity={identity} />}{page === "settings" && <Settings identity={identity} onWorkspaceChange={onWorkspaceChange} onIdentityRefresh={onIdentityRefresh} />}</main></div>;
}

function Overview({ setPage }: { setPage: (page: Page) => void }) {
  const [stats, setStats] = useState({ resources: 0, runs: 0 });
  const [recent, setRecent] = useState<Run[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([api<typeof stats>("/stats", { signal: controller.signal }), api<{ items: Run[] }>("/runs?limit=5", { signal: controller.signal })])
      .then(([summary, runs]) => { setStats(summary); setRecent(runs.items); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return <div className="overview-page">
    <section className="overview-intro"><div><span className="eyebrow">{t("WORKSPACE STATUS")}</span><h2>{t("Build with clarity.")}</h2><p>{t("Your agents, resources and execution history in one place.")}</p></div><button className="button" onClick={() => setPage("playground")}>{t("Open Playground")} <ArrowRight size={16} /></button></section>
    <div className="metric-grid"><div className="metric"><span>{t("ACTIVE RESOURCES")}</span><strong>{stats.resources}</strong><small>{t("in this workspace")}</small></div><div className="metric"><span>{t("EXECUTION RUNS")}</span><strong>{stats.runs}</strong><small>{t("all time")}</small></div><div className="metric"><span>{t("RUNTIME")}</span><strong>{t("LOCAL")}</strong><small>{t("self-hosted control plane")}</small></div><div className="metric"><span>{t("VERSION")}</span><strong>0.1</strong><small>{t("foundation release")}</small></div></div>
    <div className="overview-columns"><section><div className="section-heading"><div><span className="eyebrow">{t("RECENT ACTIVITY")}</span><h3>{t("Latest runs")}</h3></div><button className="text-button" onClick={() => setPage("runs")}>{t("View all")} <ArrowRight size={14} /></button></div><div className="activity-list">{recent.length ? recent.map((run) => <button key={run.id} onClick={() => setPage("runs")}><span className={`status-dot ${run.status}`} /><strong>{run.id.slice(0, 12)}</strong><span>{t(run.status)}</span><time>{formatDate(run.created_at)}</time></button>) : <div className="empty-inline">{t("No runs yet.")}</div>}</div></section><section><div className="section-heading"><div><span className="eyebrow">{t("QUICK ACTIONS")}</span><h3>{t("Continue building")}</h3></div></div><div className="quick-actions"><button onClick={() => setPage("resources")}><Boxes size={18} /><span>{t("Manage resources")}</span><ArrowRight size={15} /></button><button onClick={() => setPage("workflows")}><Workflow size={18} /><span>{t("Open workflow studio")}</span><ArrowRight size={15} /></button><button onClick={() => setPage("evaluations")}><ChartNoAxesCombined size={18} /><span>{t("Review evaluations")}</span><ArrowRight size={15} /></button></div></section></div>
  </div>;
}

type Collection = { id: string; name: string; description: string; created_at: number; connection_id?: string | null; connection_version?: number | null };
function Knowledge() { const [collections, setCollections] = useState<Collection[]>([]); const [connections, setConnections] = useState<{id:string;name:string;active_version:number|null}[]>([]); const [embeddings, setEmbeddings] = useState<{id:string;name:string;active_version:number|null}[]>([]); const [selected, setSelected] = useState(""); const [connection, setConnection] = useState(""); const [embedding, setEmbedding] = useState(""); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [title, setTitle] = useState(""); const [content, setContent] = useState(""); const [source, setSource] = useState(""); const [query, setQuery] = useState(""); const [mode, setMode] = useState("hybrid"); const [hits, setHits] = useState<Record<string, unknown>[]>([]); const [error, setError] = useState(""); const [message, setMessage] = useState(""); async function load() { try { const [items, available, embeddingItems] = await Promise.all([api<{items:Collection[]}>("/knowledge/collections"), api<{items:{id:string;name:string;active_version:number|null}[]}>("/knowledge/connections"), api<{items:{id:string;name:string;active_version:number|null}[]}>("/resources?kind=embedding&limit=200")]); setCollections(items.items); setConnections(available.items); setEmbeddings(embeddingItems.items); if (!selected && items.items[0]) setSelected(items.items[0].id); } catch (e) { setError((e as Error).message); } } useEffect(() => { void load(); }, []); async function createCollection(event: FormEvent) { event.preventDefault(); try { await api("/knowledge/collections", { method: "POST", body: JSON.stringify({ name, description, connection_id: connection || null, embedding_resource_id: embedding || null }) }); setName(""); setDescription(""); setConnection(""); setEmbedding(""); setMessage("Collection created"); await load(); } catch (e) { setError((e as Error).message); } } async function addDocument(event: FormEvent) { event.preventDefault(); if (!selected) return; try { await api("/knowledge/documents", { method: "POST", body: JSON.stringify({ collection_id: selected, title, content, source_uri: source }) }); setTitle(""); setContent(""); setSource(""); setMessage("Document indexed"); } catch (e) { setError((e as Error).message); } } async function search(event: FormEvent) { event.preventDefault(); if (!selected) return; try { const value = await api<{items:Record<string,unknown>[]}>("/knowledge/search", { method: "POST", body: JSON.stringify({ collection_ids: [selected], query, limit: 8, mode }) }); setHits(value.items); } catch (e) { setError((e as Error).message); } } async function syncCollection() { if (!selected) return; try { const value = await api<{imported:number;skipped:number}>(`/knowledge/collections/${selected}/sync`, { method: "POST" }); setMessage(t("Synced {imported} documents · {skipped} unchanged", { imported: value.imported, skipped: value.skipped })); await load(); } catch (e) { setError((e as Error).message); } } return <section><div className="toolbar"><div><span className="eyebrow">{t("GROUNDED CONTEXT")}</span><h2 className="section-title">{t("Knowledge")}</h2></div><Badge>{collections.length} {t("collections")}</Badge></div>{error && <div className="notice error">{error}</div>}{message && <div role="status" className="notice">{t(message)}</div>}<div className="knowledge-grid"><form className="settings-card" aria-label={t("Create collection")} onSubmit={createCollection}><h3>{t("Create collection")}</h3><p className="muted">{t("Bind an optional versioned HTTP/MCP connection and embedding provider.")}</p><label>{t("Name")}<input aria-label={t("Name")} required value={name} onChange={(e) => setName(e.target.value)} /></label><label>{t("Description")}<input aria-label={t("Description")} value={description} onChange={(e) => setDescription(e.target.value)} /></label><label>{t("Connection")}<select aria-label={t("Connection")} value={connection} onChange={(e) => setConnection(e.target.value)}><option value="">{t("Local documents")}</option>{connections.map((item) => <option key={item.id} value={item.id} disabled={!item.active_version}>{item.name}{item.active_version ? ` · v${item.active_version}` : t(" · unpublished")}</option>)}</select></label><label>{t("Embedding provider")}<select aria-label={t("Embedding provider")} value={embedding} onChange={(e) => setEmbedding(e.target.value)}><option value="">{t("Local feature hashing")}</option>{embeddings.map((item) => <option key={item.id} value={item.id} disabled={!item.active_version}>{item.name}{item.active_version ? ` · v${item.active_version}` : t(" · unpublished")}</option>)}</select></label><button className="button" type="submit">{t("Create collection")}</button></form><form className="settings-card" aria-label={t("Index document")} onSubmit={addDocument}><h3>{t("Index document")}</h3><label>{t("Collection")}<select aria-label={t("Collection")} required value={selected} onChange={(e) => setSelected(e.target.value)}><option value="">{t("Choose collection")}</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}{item.connection_id ? t(" · connected") : t(" · local")}</option>)}</select></label><label>{t("Title")}<input aria-label={t("Title")} required value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>{t("Source URI")}<input aria-label={t("Source URI")} value={source} onChange={(e) => setSource(e.target.value)} /></label><label>{t("Content")}<textarea aria-label={t("Content")} required value={content} onChange={(e) => setContent(e.target.value)} /></label><button className="button" type="submit">{t("Index document")}</button>{collections.find((item) => item.id === selected)?.connection_id && <button className="text-button" type="button" onClick={() => void syncCollection()}>{t("Sync connection")}</button>}</form></div><div className="settings-card knowledge-search"><h3>{t("Search indexed context")}</h3><form className="composer" aria-label={t("Search indexed context")} onSubmit={search}><div><input required value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search this collection…")} /><select aria-label={t("Retrieval mode")} value={mode} onChange={(e) => setMode(e.target.value)}><option value="hybrid">{t("Hybrid")}</option><option value="semantic">{t("Semantic")}</option><option value="lexical">{t("Lexical")}</option></select><button className="button" type="submit">{t("Search")}</button></div></form>{hits.length === 0 ? <p className="muted">{t("Search results show source chunks with lexical and semantic scores.")}</p> : <div className="search-results">{hits.map((hit, index) => <article key={`${String(hit.chunk_id)}-${index}`}><div><Badge>{String(hit.score)} {t("score")}</Badge><Badge>{String(hit.semantic_score)} {t("semantic")}</Badge><strong>{String(hit.title)}</strong></div><p>{String(hit.content)}</p>{typeof hit.source_uri === "string" && <small>{hit.source_uri}</small>}</article>)}</div>}</div></section>; }
