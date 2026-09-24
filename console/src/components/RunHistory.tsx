import { formatDate, t } from "../i18n";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Run } from "../api";
import { RunInspector } from "./RunInspector";

export function RunHistory() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<{ items: Run[]; total: number }>(`/runs?offset=${offset}&limit=25${status ? `&status=${status}` : ""}`, { signal: controller.signal })
      .then((result) => { setRuns(result.items); setTotal(result.total); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [offset, status, refresh]);
  return <section>
    <div className="toolbar"><div><span className="eyebrow">{t("OBSERVABILITY")}</span><h2 className="section-title">{t("Run history")}</h2></div><button className="button" onClick={() => setRefresh((value) => value + 1)}>{t("Refresh")}</button></div>
    {error && <div role="alert" className="notice error">{error}</div>}
    <label className="run-filter">{t("Status")}{" "}<select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}><option value="">{t("All statuses")}</option>{["queued", "running", "waiting_input", "waiting_approval", "cancelling", "completed", "failed", "cancelled"].map((item) => <option key={item} value={item}>{t(item)}</option>)}</select></label>
    <div className="run-table"><div className="table-head"><span>{t("RUN")}</span><span>{t("STATUS")}</span><span>{t("VERSION")}</span><span>{t("CREATED")}</span></div>{!runs.length && <div className="empty-row">{t("No matching runs.")}</div>}{runs.map((run) => <button className={`table-row run-history-row ${selected === run.id ? "active" : ""}`} key={run.id} onClick={() => setSelected(run.id)} aria-label={t("Inspect run {id}", { id: run.id })}><span className="mono">{run.id.slice(0, 12)}</span><span className="badge">{t(run.status)}</span><span>v{run.resource_version}</span><span>{formatDate(run.created_at)}</span></button>)}</div>
    <div className="workflow-actions"><button className="text-button" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 25))}>{t("Previous")}</button><span className="muted">{total ? offset + 1 : 0}–{Math.min(offset + runs.length, total)} {t("of")}{" "}{total}</span><button className="text-button" disabled={offset + runs.length >= total} onClick={() => setOffset((value) => value + 25)}>{t("Next")}</button></div>
    {selected && <RunInspector key={selected} runId={selected} />}
  </section>;
}
