import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BookOpen, FilePlus2, Files, FolderPlus, Plus, RefreshCw, Search, X } from "lucide-react";
import { api } from "../api";
import { t } from "../i18n";

type Collection = {
  id: string;
  name: string;
  description: string;
  connection_id?: string | null;
};
type ResourceChoice = { id: string; name: string; active_version: number | null };
type SearchHit = {
  chunk_id: string;
  title: string;
  content: string;
  source_uri?: string;
  score: number;
  semantic_score: number;
};
type Dialog = "collection" | "document" | null;

export function KnowledgeWorkspace() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [connections, setConnections] = useState<ResourceChoice[]>([]);
  const [embeddings, setEmbeddings] = useState<ResourceChoice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [connection, setConnection] = useState("");
  const [embedding, setEmbedding] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("hybrid");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [message, setMessage] = useState("");
  const selected = collections.find((item) => item.id === selectedId);

  async function load(signal?: AbortSignal) {
    const [collectionPage, connectionPage, embeddingPage] = await Promise.all([
      api<{ items: Collection[] }>("/knowledge/collections", { signal }),
      api<{ items: ResourceChoice[] }>("/knowledge/connections", { signal }),
      api<{ items: ResourceChoice[] }>("/resources?kind=embedding&limit=200", { signal }),
    ]);
    setCollections(collectionPage.items);
    setConnections(connectionPage.items);
    setEmbeddings(embeddingPage.items);
    setSelectedId((current) => collectionPage.items.some((item) => item.id === current)
      ? current : collectionPage.items[0]?.id || "");
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((failure) => {
      if (!controller.signal.aborted) setError((failure as Error).message);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!dialog) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setDialog(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog, busy]);

  function openDialog(value: Dialog) {
    setDialogError("");
    setDialog(value);
  }

  function selectCollection(id: string) {
    setSelectedId(id);
    setQuery("");
    setHits([]);
    setSearched(false);
    setError("");
    setMessage("");
  }

  async function createCollection(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setDialogError("");
    try {
      const created = await api<Collection>("/knowledge/collections", {
        method: "POST",
        body: JSON.stringify({ name, description, connection_id: connection || null, embedding_resource_id: embedding || null }),
      });
      await load();
      setSelectedId(created.id);
      setName(""); setDescription(""); setConnection(""); setEmbedding("");
      setDialog(null);
      setMessage("Collection created");
    } catch (failure) { setDialogError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function indexDocument(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setDialogError("");
    try {
      await api("/knowledge/documents", {
        method: "POST",
        body: JSON.stringify({ collection_id: selectedId, title, content, source_uri: source }),
      });
      setTitle(""); setContent(""); setSource("");
      setDialog(null);
      setMessage("Document indexed");
      setSearched(false);
      setHits([]);
    } catch (failure) { setDialogError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setSearching(true);
    setError("");
    try {
      const result = await api<{ items: SearchHit[] }>("/knowledge/search", {
        method: "POST",
        body: JSON.stringify({ collection_ids: [selectedId], query, limit: 8, mode }),
      });
      setHits(result.items);
      setSearched(true);
    } catch (failure) { setError((failure as Error).message); }
    finally { setSearching(false); }
  }

  async function syncCollection() {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ imported: number; skipped: number }>(`/knowledge/collections/${selectedId}/sync`, { method: "POST" });
      setMessage(t("Synced {imported} documents · {skipped} unchanged", result));
      setSearched(false);
      setHits([]);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="knowledge-page" aria-label={t("Knowledge")}>
    <div className="knowledge-page-heading">
      <div><span className="eyebrow">{t("GROUNDED CONTEXT")}</span><h2>{t("Collections")}</h2></div>
      <span className="knowledge-count">{collections.length} {t(collections.length === 1 ? "collection" : "collections")}</span>
    </div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {message && <div className="notice" role="status">{t(message)}</div>}
    <div className="knowledge-layout">
      <nav className="knowledge-collections" aria-label={t("Collections")}>
        <div className="knowledge-collections-heading">
          <strong>{t("Collections")}</strong>
          <button className="knowledge-add-icon" type="button" title={t("New collection")} aria-label={t("New collection")} onClick={() => openDialog("collection")}><Plus size={18} /></button>
        </div>
        {collections.length ? <div className="knowledge-collection-list">{collections.map((item) =>
          <button type="button" key={item.id} className={`knowledge-collection ${selectedId === item.id ? "active" : ""}`} aria-current={selectedId === item.id ? "page" : undefined} onClick={() => selectCollection(item.id)}>
            <BookOpen size={16} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.connection_id ? t("Connected source") : t("Local documents")}</small></span>
          </button>
        )}</div> : <p className="knowledge-sidebar-empty">{t("No collections yet")}</p>}
        <button type="button" className="knowledge-new-link" onClick={() => openDialog("collection")}><Plus size={15} aria-hidden="true" />{t("New collection")}</button>
      </nav>

      <div className="knowledge-main">
        {!selected ? <div className="knowledge-empty">
          <div className="knowledge-empty-icon"><FolderPlus size={29} strokeWidth={1.5} /></div>
          <h3>{t("No collections yet")}</h3>
          <p>{t("Create a collection to organize your sources.")}</p>
          <button className="button" onClick={() => openDialog("collection")}><Plus size={16} aria-hidden="true" />{t("Create collection")}</button>
        </div> : <>
          <div className="knowledge-collection-header">
            <div><span className="eyebrow">{t("COLLECTION")}</span><h3>{selected.name}</h3>{selected.description && <p>{selected.description}</p>}</div>
            <div className="knowledge-actions">
              {selected.connection_id && <button className="text-button" disabled={busy} onClick={() => void syncCollection()}><RefreshCw size={15} aria-hidden="true" />{t("Sync connection")}</button>}
              <button className="button" onClick={() => openDialog("document")}><FilePlus2 size={16} aria-hidden="true" />{t("Index document")}</button>
            </div>
          </div>
          <form className="knowledge-search-form" aria-label={t("Search indexed context")} onSubmit={search}>
            <Search size={18} className="knowledge-search-icon" aria-hidden="true" />
            <input name="query" required value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("Search indexed context")} placeholder={t("Search this collection…")} />
            <select aria-label={t("Retrieval mode")} value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="hybrid">{t("Hybrid")}</option><option value="semantic">{t("Semantic")}</option><option value="lexical">{t("Lexical")}</option>
            </select>
            <button className="button" disabled={searching}>{searching ? t("Searching…") : t("Search")}</button>
          </form>
          <div className="knowledge-results" aria-live="polite">
            {hits.length ? <><div className="knowledge-results-heading"><strong>{t("Search results")}</strong><span>{hits.length} {t(hits.length === 1 ? "result" : "results")}</span></div>{hits.map((hit) =>
              <article key={hit.chunk_id} className="knowledge-result">
                <div className="knowledge-result-heading"><Files size={16} aria-hidden="true" /><strong>{hit.title}</strong><span>{Number(hit.score).toFixed(2)} {t("score")}</span></div>
                <p>{hit.content}</p>
                <div className="knowledge-result-meta"><span>{Number(hit.semantic_score).toFixed(2)} {t("semantic")}</span>{hit.source_uri && <span>{hit.source_uri}</span>}</div>
              </article>
            )}</> : <div className="knowledge-results-empty"><Search size={22} strokeWidth={1.6} aria-hidden="true" /><strong>{searched ? t("No matching documents") : t("Search this collection")}</strong><span>{searched ? t("Try another query or retrieval mode.") : t("Indexed results will appear here.")}</span></div>}
          </div>
        </>}
      </div>
    </div>

    {dialog && <div className="knowledge-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(null); }}>
      <div className="knowledge-dialog" role="dialog" aria-modal="true" aria-label={t(dialog === "collection" ? "Create collection" : "Index document")}>
        <div className="knowledge-dialog-header"><div><span className="eyebrow">{t(dialog === "collection" ? "COLLECTION" : "DOCUMENT")}</span><h2>{t(dialog === "collection" ? "Create collection" : "Index document")}</h2></div><button className="knowledge-dialog-close" type="button" aria-label={t("Close")} onClick={() => setDialog(null)}><X size={18} /></button></div>
        {dialogError && <div className="notice error" role="alert">{dialogError}</div>}
        {dialog === "collection" ? <form aria-label={t("Create collection")} onSubmit={createCollection}>
          <label>{t("Name")}<input name="name" autoComplete="off" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>{t("Description")}<input name="description" autoComplete="off" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <div className="knowledge-field-divider" />
          <label>{t("Connection")}<select value={connection} onChange={(event) => setConnection(event.target.value)}><option value="">{t("Local documents")}</option>{connections.map((item) => <option key={item.id} value={item.id} disabled={!item.active_version}>{item.name}{item.active_version ? ` · v${item.active_version}` : t(" · unpublished")}</option>)}</select></label>
          <label>{t("Embedding provider")}<select value={embedding} onChange={(event) => setEmbedding(event.target.value)}><option value="">{t("Local feature hashing")}</option>{embeddings.map((item) => <option key={item.id} value={item.id} disabled={!item.active_version}>{item.name}{item.active_version ? ` · v${item.active_version}` : t(" · unpublished")}</option>)}</select></label>
          <div className="knowledge-dialog-actions"><button type="button" className="text-button" onClick={() => setDialog(null)}>{t("Cancel")}</button><button className="button" disabled={busy}>{t("Create collection")}</button></div>
        </form> : <form aria-label={t("Index document")} onSubmit={indexDocument}>
          <label>{t("Collection")}<input value={selected?.name || ""} readOnly /></label>
          <label>{t("Title")}<input name="title" autoComplete="off" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>{t("Source URI")}<input name="source_uri" type="text" autoComplete="off" value={source} onChange={(event) => setSource(event.target.value)} /></label>
          <label>{t("Content")}<textarea name="content" required value={content} onChange={(event) => setContent(event.target.value)} /></label>
          <div className="knowledge-dialog-actions"><button type="button" className="text-button" onClick={() => setDialog(null)}>{t("Cancel")}</button><button className="button" disabled={busy}>{t("Index document")}</button></div>
        </form>}
      </div>
    </div>}
  </section>;
}
