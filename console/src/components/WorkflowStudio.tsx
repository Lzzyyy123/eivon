import { t } from "../i18n";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { Resource } from "../api";
import { RunInspector } from "./RunInspector";

type Ref = { id: string; version: number };
type Step = { id: string; type: "input" | "tool" | "prompt" | "condition"; question?: string; input_schema?: Record<string, unknown>; tool_ref?: Ref; arguments?: Record<string, unknown>; model_ref?: Ref; template?: string; value_path?: string; equals?: unknown; skip_step_ids?: string[] };
type Workflow = { description: string; input_schema: Record<string, unknown>; output_template: string; steps: Step[] };
type Row = Step & { key: string; json: string };
const json = (value: unknown) => JSON.stringify(value, null, 2);
function row(step: Step): Row {
  return { ...step, key: crypto.randomUUID(), json: json(step.type === "condition" ? step.equals ?? null : step.type === "tool" ? step.arguments || {} : step.input_schema || { type: "object" }) };
}
function parse(text: string, label: string, object = false) {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(`${label}: enter valid JSON`); }
  if (object && (value === null || Array.isArray(value) || typeof value !== "object")) throw new Error(`${label}: enter a JSON object`);
  return value;
}
async function allResources(kind: string): Promise<Resource[]> {
  const items: Resource[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await api<{ items: Resource[]; total: number }>(`/resources?kind=${kind}&offset=${offset}&limit=200`);
    items.push(...page.items);
    if (items.length >= page.total || !page.items.length) return items;
  }
}

export function WorkflowStudio() {
  const [items, setItems] = useState<Resource[]>([]);
  const [tools, setTools] = useState<Resource[]>([]);
  const [models, setModels] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [inputSchema, setInputSchema] = useState('{"type":"object"}');
  const [outputTemplate, setOutputTemplate] = useState("{{steps}}");
  const [steps, setSteps] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [runInput, setRunInput] = useState("{}");
  const [runId, setRunId] = useState("");
  const [view, setView] = useState<"steps" | "graph">("steps");

  async function load() {
    const [workflows, availableTools, availableModels] = await Promise.all([allResources("workflow"), allResources("tool"), allResources("model")]);
    setItems(workflows); setTools(availableTools.filter((item) => item.active_version)); setModels(availableModels.filter((item) => item.active_version));
  }
  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);
  function edit(item: Resource | null) {
    const draft = item?.draft as Workflow | undefined;
    setSelected(item); setName(item?.name || ""); setSlug(item?.slug || ""); setDescription(draft?.description || "");
    setInputSchema(json(draft?.input_schema || { type: "object" })); setOutputTemplate(draft?.output_template ?? "{{steps}}");
    setSteps((draft?.steps || []).map(row)); setError(""); setMessage(""); setRunId("");
  }
  function add(type: Step["type"]) {
    let index = 1; while (steps.some((step) => step.id === `${type}_${index}`)) index++;
    const step: Step = { type, id: `${type}_${index}` };
    if (type === "input") step.question = "What should be provided?";
    if (type === "prompt") { step.template = "{{input.message}}"; if (models[0]) step.model_ref = { id: models[0].id, version: models[0].active_version! }; }
    if (type === "tool" && tools[0]) step.tool_ref = { id: tools[0].id, version: tools[0].active_version! };
    if (type === "condition") { step.value_path = "input.skip"; step.equals = true; step.skip_step_ids = []; }
    setSteps((previous) => [...previous, row(step)]);
  }
  function update(key: string, patch: Partial<Row>) { setSteps((previous) => previous.map((step) => step.key === key ? { ...step, ...patch } : step)); }
  function move(index: number, delta: number) {
    setSteps((previous) => { const next = [...previous]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; });
  }
  function buildSpec(): Workflow {
    const ids = steps.map((step) => step.id);
    if (!steps.length) throw new Error(t("Add at least one step"));
    if (new Set(ids).size !== ids.length) throw new Error(t("Step IDs must be unique"));
    const configured = steps.map((step, index): Step => {
      if (step.type === "input") return { type: step.type, id: step.id, question: step.question, input_schema: parse(step.json, `${step.id} input schema`, true) as Record<string, unknown> };
      if (step.type === "tool") {
        if (!step.tool_ref) throw new Error(`${step.id}: choose a published tool`);
        return { type: step.type, id: step.id, tool_ref: step.tool_ref, arguments: parse(step.json, `${step.id} arguments`, true) as Record<string, unknown> };
      }
      if (step.type === "prompt") {
        if (!step.model_ref) throw new Error(`${step.id}: choose a published model`);
        return { type: step.type, id: step.id, model_ref: step.model_ref, template: step.template };
      }
      if (step.skip_step_ids?.some((id) => !ids.slice(index + 1).includes(id))) throw new Error(`${step.id}: conditions can only skip later steps`);
      return { type: step.type, id: step.id, value_path: step.value_path, equals: parse(step.json, `${step.id} equals`), skip_step_ids: step.skip_step_ids || [] };
    });
    return { description, input_schema: parse(inputSchema, "Workflow input schema", true) as Record<string, unknown>, output_template: outputTemplate, steps: configured };
  }
  async function save(publish: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const spec = buildSpec();
      const saved = selected
        ? await api<Resource>(`/resources/${selected.id}`, { method: "PUT", body: JSON.stringify({ revision: selected.revision, name, spec }) })
        : await api<Resource>("/resources", { method: "POST", body: JSON.stringify({ kind: "workflow", name, slug, spec }) });
      setSelected(saved);
      if (publish) {
        await api(`/resources/${saved.id}/publish`, { method: "POST", body: JSON.stringify({ revision: saved.revision }) });
        setSelected(await api<Resource>(`/resources/${saved.id}`));
      }
      await load(); setMessage(publish ? "Release published" : "Draft saved");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function start() {
    if (!selected?.active_version) return;
    setBusy(true); setError("");
    try {
      const run = await api<{ id: string }>("/runs", { method: "POST", body: JSON.stringify({ resource_id: selected.id, version: selected.active_version, input: parse(runInput, "Run input", true) }) });
      setRunId(run.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function reference(step: Row, kind: "tool" | "model") {
    const field = kind === "tool" ? "tool_ref" : "model_ref";
    const choices = kind === "tool" ? tools : models;
    const ref = step[field];
    return <div className="step-grid"><label>{kind === "tool" ? t("Tool") : t("Model")}<select required value={ref?.id || ""} onChange={(e) => { const item = choices.find((item) => item.id === e.target.value); update(step.key, { [field]: item ? { id: item.id, version: item.active_version! } : undefined }); }}><option value="">{t("Choose published")}{" "}{t(kind)}</option>{ref && !choices.some((item) => item.id === ref.id) && <option value={ref.id}>{ref.id} {t("(unavailable)")}</option>}{choices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t("Version")}<input type="number" min={1} required value={ref?.version || ""} onChange={(e) => ref && update(step.key, { [field]: { ...ref, version: Number(e.target.value) } })} /></label></div>;
  }
  return <section>
    <div className="toolbar"><div><span className="eyebrow">{t("ORCHESTRATION")}</span><h2 className="section-title">{t("Workflow studio")}</h2></div><button className="button" disabled={busy} onClick={() => edit(null)}>{t("+ New workflow")}</button></div>
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{t(message)}</div>}
    <div className="workflow-studio"><div className="workflow-list"><div className="chat-head">{t("SAVED WORKFLOWS ·")}{" "}{items.length}</div>{!items.length && <p className="muted">{t("No workflows yet.")}</p>}{items.map((item) => <button disabled={busy} className={`workflow-item ${selected?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => edit(item)}><strong>{item.name}</strong><small>{item.active_version ? t("Published v{version}", { version: item.active_version }) : t("Draft")}</small></button>)}</div>
      <form className="workflow-editor" onSubmit={(event) => { event.preventDefault(); void save(false); }}>
        <fieldset disabled={busy}><legend>{selected ? t("Draft revision {revision}", { revision: selected.revision }) : t("New workflow")}</legend>
          <div className="step-grid"><label>{t("Name")}<input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></label><label>{t("Slug")}<input required disabled={!!selected} pattern="[a-z][a-z0-9_.-]{1,99}" value={slug} onChange={(e) => setSlug(e.target.value)} /></label></div>
          <label>{t("Description")}<input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <details><summary>{t("Workflow input and output")}</summary><label>{t("Input schema JSON")}<textarea value={inputSchema} onChange={(e) => setInputSchema(e.target.value)} /></label><label>{t("Output template")}<textarea value={outputTemplate} onChange={(e) => setOutputTemplate(e.target.value)} /></label></details>
          <p className="muted">{t("Bind values with")}{" "}{"{{input.field}}"}, {"{{context.field}}"} {t("or")}{" "}{"{{steps.step_id.data.field}}"}{t(". A whole placeholder keeps its JSON type.")}</p>
          <div className="workflow-view-switch" aria-label={t("Workflow view")}><button type="button" className={view === "steps" ? "active" : "text-button"} onClick={() => setView("steps")}>{t("Step editor")}</button><button type="button" className={view === "graph" ? "active" : "text-button"} onClick={() => setView("graph")}>{t("Graph view")}</button></div>
          {view === "steps" ? <div className="workflow-canvas">{steps.map((step, index) => <section className="workflow-step" key={step.key} aria-label={t("Step {number}", { number: index + 1 })}>
            <div className="step-number">{index + 1}</div><div className="step-content"><div className="step-title"><span className="badge">{t(step.type)}</span><label>{t("Step ID")}<input required pattern="[a-z][a-z0-9_]{0,63}" value={step.id} onChange={(e) => { const id = e.target.value; setSteps((previous) => previous.map((item) => ({ ...item, ...(item.key === step.key ? { id } : {}), skip_step_ids: item.skip_step_ids?.map((target) => target === step.id ? id : target) }))); }} /></label></div>
              {step.type === "input" && <><label>{t("Question")}<input required value={step.question || ""} onChange={(e) => update(step.key, { question: e.target.value })} /></label><label>{t("Response schema JSON")}<textarea value={step.json} onChange={(e) => update(step.key, { json: e.target.value })} /></label></>}
              {step.type === "tool" && <>{reference(step, "tool")}<label>{t("Arguments JSON")}<textarea value={step.json} onChange={(e) => update(step.key, { json: e.target.value })} /></label></>}
              {step.type === "prompt" && <>{reference(step, "model")}<label>{t("Prompt template")}<textarea required value={step.template || ""} onChange={(e) => update(step.key, { template: e.target.value })} /></label></>}
              {step.type === "condition" && <><label>{t("Value path")}<input required value={step.value_path || ""} onChange={(e) => update(step.key, { value_path: e.target.value })} /></label><label>{t("Equals JSON")}<textarea value={step.json} onChange={(e) => update(step.key, { json: e.target.value })} /></label><div className="skip-options"><p className="muted">{t("Skip selected later steps when the value matches:")}</p>{steps.slice(index + 1).map((target) => <label key={target.key}><input type="checkbox" checked={step.skip_step_ids?.includes(target.id) || false} onChange={(e) => update(step.key, { skip_step_ids: e.target.checked ? [...(step.skip_step_ids || []), target.id] : step.skip_step_ids?.filter((id) => id !== target.id) })} />{target.id}</label>)}</div></>}
              <div className="workflow-actions"><button type="button" className="text-button" disabled={!index} onClick={() => move(index, -1)}>{t("Move up")}</button><button type="button" className="text-button" disabled={index === steps.length - 1} onClick={() => move(index, 1)}>{t("Move down")}</button><button type="button" className="text-button" onClick={() => setSteps((previous) => previous.filter((item) => item.key !== step.key).map((item) => ({ ...item, skip_step_ids: item.skip_step_ids?.filter((id) => id !== step.id) })))}>{t("Remove step")}</button></div>
            </div></section>)}</div> : <WorkflowGraph steps={steps} />}
          <div className="workflow-actions">{(["input", "tool", "prompt", "condition"] as const).map((type) => <button type="button" className="button" key={type} onClick={() => add(type)}>+ {t(type[0].toUpperCase() + type.slice(1))}</button>)}<span className="workflow-spacer" /><button className="button" type="submit">{t("Save draft")}</button><button className="button" type="button" onClick={(event) => { if (event.currentTarget.form?.reportValidity()) void save(true); }}>{t("Save and publish")}</button></div>
        </fieldset>
      </form>
    </div>
    {selected?.active_version && <section className="settings-card run-launcher"><h3>{t("Run published v")}{selected.active_version}</h3><p className="muted">{t("Runs use the published release. Save and publish to include your latest edits.")}</p><label>{t("Run input JSON")}<textarea value={runInput} onChange={(e) => setRunInput(e.target.value)} /></label><button className="button" disabled={busy} onClick={() => void start()}>{t("Run published workflow")}</button></section>}
    {runId && <RunInspector key={runId} runId={runId} />}
  </section>;
}

function WorkflowGraph({ steps }: { steps: Row[] }) {
  return <section className="workflow-graph" aria-label={t("Workflow graph")}><div className="graph-header"><strong>{t("Execution graph")}</strong><span className="muted">{t("Ordered flow with conditional skip edges")}</span></div>{steps.length === 0 && <p className="muted">{t("Add steps to see the graph.")}</p>}{steps.map((step, index) => <div className="graph-column" key={step.key}><article className={`graph-node graph-${step.type}`}><div><span className="badge">{t(step.type)}</span><strong>{step.id}</strong></div>{step.type === "condition" && <small>{step.value_path} = {JSON.stringify(step.equals)}</small>}{step.type === "tool" && <small>{t("Tool ·")}{" "}{step.tool_ref?.id || t("unbound")}</small>}{step.type === "prompt" && <small>{t("Model ·")}{" "}{step.model_ref?.id || t("unbound")}</small>}{step.type === "input" && <small>{step.question}</small>}</article>{index < steps.length - 1 && <div className="graph-edge" aria-hidden="true">↓</div>}{step.type === "condition" && step.skip_step_ids?.length ? <div className="graph-branch">{t("skips →")}{" "}{step.skip_step_ids.join(", ")}</div> : null}</div>)}</section>;
}
