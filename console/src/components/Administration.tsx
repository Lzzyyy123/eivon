import { formatDate, setLanguage, t, useLanguage } from "../i18n";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Identity } from "../api";

type Member = { user_id: string; name: string; email: string; role: string };
type Credential = { id: string; name: string; updated_at: number };
type Key = { id: string; name: string; permissions: string[]; expires_at: number };
const when = formatDate;

export function Members({ identity }: { identity: Identity }) {
  const [items, setItems] = useState<Member[]>([]);
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [role, setRole] = useState("editor");
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const options = identity.role === "owner" ? ["admin", "editor", "operator", "viewer"] : ["editor", "operator", "viewer"];
  async function load() { setItems((await api<{ items: Member[] }>("/members")).items); setRoles({}); }
  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);
  async function perform(action: () => Promise<void>, text: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await load(); setMessage(text); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="administration">
    <div className="toolbar"><h2 className="section-title">{t("Workspace members")}</h2><span className="badge">{items.length} {t("members")}</span></div>
    {error && <div role="alert" className="notice error">{error}</div>}{message && <div role="status" className="notice">{t(message)}</div>}
    <div className="knowledge-grid"><form className="settings-card" aria-label={t("Add member")} onSubmit={(event) => { event.preventDefault(); void perform(async () => { await api("/members", { method: "POST", body: JSON.stringify({ name, email, password: password || null, role }) }); setName(""); setEmail(""); setPassword(""); }, "Member added"); }}>
      <h3>{t("Add a member")}</h3><p className="muted">{t("New accounts require an initial password of at least 12 characters. For an existing account, leave it blank; its name and password stay unchanged.")}</p>
      <fieldset disabled={busy}><label>{t("Name")}<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label><label>{t("Email")}<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>{t("Initial password")}<input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label><label>{t("Role")}<select value={role} onChange={(e) => setRole(e.target.value)}>{options.map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></label><button className="button">{t("Add member")}</button></fieldset>
    </form><section className="settings-card" aria-label={t("Member list")}><h3>{t("Access roles")}</h3><p className="muted">{t("Owner/admin: manage; editor: author and run; operator: run and approve; viewer: read. Only owners can manage administrators.")}</p>
      {items.map((item) => { const editable = item.role !== "owner" && item.user_id !== identity.user.id && (identity.role === "owner" || item.role !== "admin"); return <article key={item.user_id} className="admin-item" aria-label={item.email}><strong>{item.name}</strong><small>{item.email}</small>{editable ? <div><label>{t("Member role")}<select disabled={busy} value={roles[item.user_id] || item.role} onChange={(e) => setRoles((previous) => ({ ...previous, [item.user_id]: e.target.value }))}>{options.map((option) => <option key={option} value={option}>{t(option)}</option>)}</select></label><div className="workflow-actions"><button className="button" disabled={busy || !roles[item.user_id] || roles[item.user_id] === item.role} onClick={() => void perform(async () => { await api(`/members/${item.user_id}`, { method: "PATCH", body: JSON.stringify({ role: roles[item.user_id] }) }); }, "Member role updated")}>{t("Save role")}</button><button className="text-button" disabled={busy} onClick={() => void perform(async () => { await api(`/members/${item.user_id}`, { method: "DELETE" }); }, "Member removed; workspace API keys revoked")}>{t("Remove member")}</button></div></div> : <span className="badge">{t(item.role)}{item.user_id === identity.user.id ? t(" · you") : ""}</span>}</article>; })}
    </section></div>
  </section>;
}

export function Settings({ identity, onWorkspaceChange, onIdentityRefresh }: { identity: Identity; onWorkspaceChange: (id: string) => void; onIdentityRefresh: () => void }) {
  const language = useLanguage();
  const current = identity.workspaces.find((item) => item.id === identity.workspace_id)!;
  const admin = identity.permissions.includes("admin");
  const [workspaceName, setWorkspaceName] = useState(current.name);
  const [newWorkspace, setNewWorkspace] = useState("");
  const [credentials, setCredentials] = useState<Credential[]>([]); const [keys, setKeys] = useState<Key[]>([]);
  const [rotation, setRotation] = useState<Credential | null>(null);
  const [credentialName, setCredentialName] = useState(""); const [credentialValue, setCredentialValue] = useState("");
  const [keyName, setKeyName] = useState(""); const [permissions, setPermissions] = useState(["read", "execute"]); const [days, setDays] = useState(30);
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [auditRevision, setAuditRevision] = useState(0);
  useEffect(() => { setWorkspaceName(current.name); }, [current.name]);
  async function load() { if (!admin) return; const [a, b] = await Promise.all([api<{ items: Credential[] }>("/credentials"), api<{ items: Key[] }>("/api-keys")]); setCredentials(a.items); setKeys(b.items); }
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [admin]);
  async function perform(action: () => Promise<void>, text: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); await load(); setAuditRevision((value) => value + 1); setMessage(text); } catch (e) { if ((e as Error).name !== "AbortError") setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="administration">
    <div className="toolbar"><h2 className="section-title">{t("Workspace settings")}</h2><button className="text-button" onClick={onIdentityRefresh}>{t("Refresh access")}</button></div>
    <section className="preferences-section" aria-label={t("Interface language")}><div><h3>{t("Interface language")}</h3><p className="muted">{t("Choose the language used across the console.")}</p></div><div className="language-options" role="group" aria-label={t("Interface language")}><button type="button" className={language === "en" ? "active" : ""} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button><button type="button" className={language === "zh-CN" ? "active" : ""} aria-pressed={language === "zh-CN"} onClick={() => setLanguage("zh-CN")}>简体中文</button></div></section>
    {error && <div role="alert" className="notice error">{error}</div>}{message && <div role="status" className="notice">{t(message)}</div>}
    <section className="settings-card"><h3>{current.name}</h3><p className="mono">{identity.workspace_id}</p><p className="muted">{t("Signed in as")}{" "}{identity.user.email} · {t(identity.role)}</p><p className="muted">{t("Permissions:")}{" "}{identity.permissions.map((permission) => t(permission)).join(", ")}</p></section>
    {admin && <><div className="knowledge-grid settings-admin-grid">
      <form className="settings-card" aria-label={t("Rename workspace")} onSubmit={(event) => { event.preventDefault(); void perform(async () => { await api(`/workspaces/${identity.workspace_id}`, { method: "PATCH", body: JSON.stringify({ name: workspaceName }) }); onIdentityRefresh(); }, "Workspace renamed"); }}><h3>{t("Workspace name")}</h3><label>{t("Name")}<input required maxLength={120} disabled={busy} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} /></label><button className="button" disabled={busy}>{t("Rename workspace")}</button></form>
      <form className="settings-card" aria-label={t("Create workspace")} onSubmit={(event) => { event.preventDefault(); void perform(async () => { const created = await api<{ id: string }>("/workspaces", { method: "POST", body: JSON.stringify({ name: newWorkspace }) }); onWorkspaceChange(created.id); }, "Workspace created"); }}><h3>{t("Create workspace")}</h3><p className="muted">{t("Start a separate space with its own resources, conversations, members and credentials.")}</p><label>{t("Name")}<input required maxLength={120} disabled={busy} value={newWorkspace} onChange={(e) => setNewWorkspace(e.target.value)} /></label><button className="button" disabled={busy}>{t("Create workspace")}</button></form>
      <form className="settings-card" aria-label={t("Credential editor")} onSubmit={(event) => { event.preventDefault(); void perform(async () => { await api(rotation ? `/credentials/${rotation.id}` : "/credentials", { method: rotation ? "PUT" : "POST", body: JSON.stringify({ name: credentialName, value: credentialValue }) }); setCredentialName(""); setCredentialValue(""); setRotation(null); }, rotation ? "Credential rotated" : "Credential saved"); }}><h3>{rotation ? t("Rotate credential") : t("Encrypted credentials")}</h3><p className="muted">{t("Rotation replaces the secret while preserving its ID and resource references. Stored values are never displayed.")}</p><fieldset disabled={busy}><label>{t("Credential name")}<input required maxLength={120} value={credentialName} onChange={(e) => setCredentialName(e.target.value)} /></label><label>{t("Secret value")}<input required type="password" autoComplete="new-password" value={credentialValue} onChange={(e) => setCredentialValue(e.target.value)} /></label><button className="button">{rotation ? t("Save rotation") : t("Save credential")}</button>{rotation && <button type="button" className="text-button" onClick={() => { setRotation(null); setCredentialName(""); setCredentialValue(""); }}>{t("Cancel rotation")}</button>}</fieldset><div>{credentials.map((item) => <article className="admin-item" key={item.id}><strong>{item.name}</strong><small>{t("Updated")}{" "}{when(item.updated_at)}</small><button type="button" className="text-button" disabled={busy} onClick={() => { setRotation(item); setCredentialName(item.name); setCredentialValue(""); }}>{t("Rotate")}{" "}{item.name}</button></article>)}</div></form>
      <section className="settings-card" aria-label={t("API key management")}><h3>{t("Workspace API keys")}</h3><form onSubmit={(event) => { event.preventDefault(); void perform(async () => { const created = await api<Key & { secret: string }>("/api-keys", { method: "POST", body: JSON.stringify({ name: keyName, permissions, expires_in_days: days }) }); setSecret({ id: created.id, value: created.secret }); setKeyName(""); }, "API key created"); }}><fieldset disabled={busy}><label>{t("Key name")}<input required maxLength={120} value={keyName} onChange={(e) => setKeyName(e.target.value)} /></label><label>{t("Expires in days")}<input required type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label><div className="permission-options">{identity.permissions.map((item) => <label key={item}><input type="checkbox" checked={permissions.includes(item)} onChange={(e) => setPermissions((previous) => e.target.checked ? [...previous, item] : previous.filter((value) => value !== item))} />{t(item)}</label>)}</div><button className="button" disabled={!permissions.length}>{t("Create API key")}</button></fieldset></form>{secret && <div className="notice">{t("Copy this secret now. It will not be returned again.")}<code className="secret" data-testid="api-key-secret">{secret.value}</code><button className="text-button" onClick={() => setSecret(null)}>{t("Hide secret")}</button></div>}{keys.map((item) => <article className="admin-item" key={item.id} aria-label={item.name}><strong>{item.name}</strong><small>{item.permissions.map((permission) => t(permission)).join(", ")} · {item.expires_at * 1000 > Date.now() ? t("expires") : t("expired")} {when(item.expires_at)}</small><button className="text-button" disabled={busy} onClick={() => void perform(async () => { await api(`/api-keys/${item.id}`, { method: "DELETE" }); if (secret?.id === item.id) setSecret(null); }, "API key revoked")}>{t("Revoke key")}</button></article>)}</section>
    </div><AuditLog revision={auditRevision} /></>}
  </section>;
}

type Audit = { id: string; action: string; user_id: string; target_id: string | null; created_at: number; details: Record<string, unknown> };
function AuditLog({ revision }: { revision: number }) {
  const [items, setItems] = useState<Audit[]>([]); const [offset, setOffset] = useState(0); const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0); const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<{ items: Audit[]; total: number }>(`/audit-events?offset=${offset}&limit=25`, { signal: controller.signal }).then((value) => { setItems(value.items); setTotal(value.total); setError(""); }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [offset, refresh, revision]);
  return <section className="settings-card audit-log" aria-label={t("Workspace audit log")}><div className="toolbar"><h3>{t("Workspace audit log")}</h3><button className="text-button" onClick={() => setRefresh((value) => value + 1)}>{t("Refresh audit")}</button></div>{error && <div className="notice error" role="alert">{error}</div>}{items.map((item) => <article key={item.id} className="admin-item"><strong>{item.action}</strong><small>{when(item.created_at)} {t("· actor")}{" "}{item.user_id}</small><details><summary>{t("Event details")}</summary><pre>{JSON.stringify({ target_id: item.target_id, ...item.details }, null, 2)}</pre></details></article>)}{!items.length && <p className="muted">{t("No events yet.")}</p>}<div className="workflow-actions"><button className="text-button" disabled={!offset} onClick={() => setOffset((value) => Math.max(0, value - 25))}>{t("Previous")}</button><span className="muted">{total ? offset + 1 : 0}–{Math.min(offset + items.length, total)} {t("of")}{" "}{total}</span><button className="text-button" disabled={offset + items.length >= total} onClick={() => setOffset((value) => value + 25)}>{t("Next")}</button></div></section>;
}
