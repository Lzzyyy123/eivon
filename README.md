# Eivon

**A place for autonomous intelligence.**

Eivon is a self-hosted, domain-independent agent workbench. It gives teams a control plane for composing models, tools, skills, knowledge sources and workflows into versioned Agents, then running them through an observable, resumable runtime.

The core does not know what industry an Agent serves. A customer support Agent, an operations Agent and an agriculture Agent use the same resource contracts. Business entities and permissions belong in extensions and Bundle packages.

![Eivon conversations and private file delivery](docs/images/agent-conversation.png)

Console screenshot from the deterministic browser acceptance fixture. See the [conversation guide](docs/conversations.md) for multi-turn sessions, tool approvals and generated files.

## What is included

- A versioned resource model for models, prompts, tools, skills, Bundles, Agents and Workflows.
- Immutable release snapshots: each Run records the exact dependency versions it uses.
- Streaming model and embedding adapters for OpenAI-compatible endpoints plus explicitly labelled offline providers.
- Typed tool execution with JSON Schema validation, timeouts, result budgets, write approvals and outbound host allowlists.
- Durable Runs with ordered events, cancellation, approval/input waiting, resume support and worker leases.
- Workspace-scoped resources, roles, API keys, CSRF-protected sessions, encrypted credentials and audit events.
- A dark management console with setup, overview, resource authoring, Agent publishing, Playground, Run history, Knowledge connections with lexical, semantic and hybrid retrieval and workspace administration (switching, members, credentials, API keys and audit).
- An evaluation center with immutable test sets, historical batches, version comparison, rule scores, model-generated failure analysis, human reviews and instruction candidates that require approval before updating a draft.
- SQLite for a zero-dependency local instance and PostgreSQL for deployment.
- A deployment-time Python extension SDK with optional process isolation; HTTP tools are configured with explicit server allowlists.

Python extensions run with the deployment's privileges. Eivon is not a sandbox for untrusted extension code. Read [SECURITY.md](SECURITY.md) before exposing an instance.

## Quick start

Requirements: Python 3.12+, Node 22+ for building the console.

```bash
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
cd console && npm install && npm run build && cd ..
.venv/bin/eivon init
.venv/bin/eivon migrate
.venv/bin/eivon serve --host 127.0.0.1 --port 8787
```

Open <http://127.0.0.1:8787>. The first command creates `var/setup-token`; paste that token into the setup screen. The offline demo model can be configured from the Resource library, so no model API key is needed for the first walkthrough.

For PostgreSQL and a production-like container deployment:

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD, EIVON_SECRET_KEY and EIVON_SETUP_TOKEN in .env.
docker compose up --build
```

Before upgrades, run `eivon backup` for SQLite or your PostgreSQL dump workflow and rehearse `eivon restore --force` with API and workers stopped. The default Compose service runs an inline worker. For a separate worker, set `EIVON_INLINE_WORKER=false` for the API service and start the worker profile with `docker compose -f docker-compose.yml -f docker-compose.worker.yml up --build`.

## First Agent walkthrough

1. Complete the setup screen.
2. Open **Resources → New resource**, create a `model` using the offline demo provider, and publish it.
3. Create a `prompt` and publish it.
4. Open **Agents → New resource**, select the published model and prompt, and publish the Agent.
5. Open **Playground**, select the published Agent, send a message and watch the ordered execution trace. If a tool requires approval, the run pauses with an approval card and resumes from the same checkpoint.

For a real provider, create an encrypted Credential in Settings or through the API, reference its ID from a model resource, and add the model endpoint host to `EIVON_OUTBOUND_HOSTS`. Secrets are never returned by the credential API.

## Public API shape

The FastAPI schema is available at `/docs`. Important groups are:

- `/api/v1/setup`, `/auth/*`, `/workspaces`, `/members`, `/api-keys`, `/credentials`, `/audit-events`
- `/api/v1/resources`, `/resources/{id}/publish`, `/resources/{id}/versions`
- `/api/v1/sessions`, `/runs`, `/runs/{id}/events`, `/runs/{id}/cancel`, `/runs/{id}/resume`
- `/api/v1/evaluations`, `/evaluations/{id}/run`, `/evaluation-jobs/{id}`
- `/api/v1/artifacts/{id}/download`

Use a session cookie from the browser or an API key as `Authorization: Bearer eiv_...`. Cookie writes require the `x-csrf-token` returned by setup/login. API keys are workspace-bound and only shown once when created.

## Extension model

A trusted Python extension module exports `register(registry)` and registers async handlers. A Tool resource chooses `adapter: python` and the registered entrypoint. Keep domain implementations outside `eivon.core`; the `examples/` directory contains a minimal resource graph, two synthetic extension modules and importable Bundle starters.

HTTP tools use a configured URL and method, but the deployment must explicitly allow the destination via `EIVON_OUTBOUND_HOSTS`. Arbitrary URLs, embedded credentials, redirects and secret headers are rejected.

## Development checks

```bash
.venv/bin/pytest -q
.venv/bin/ruff check src tests
cd console && npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [docs/DELIVERY.md](docs/DELIVERY.md). The delivery checklist is intentionally honest about capabilities that are still being implemented; this repository is not labelled a stable release yet.

## License

Apache-2.0. See [LICENSE](LICENSE).

Workflow authoring, branching, input/approval waits and execution inspection are covered in the [workflow guide](docs/workflows.md). The console includes a structured editor and a Run history inspector; [delivery status](docs/DELIVERY.md) tracks capabilities still pending.

The [resource guide](docs/resources.md) covers capability authoring, immutable releases, specification comparisons, rollback and archive/restore.

See [workspace administration](docs/administration.md) for scope selection, member roles, credential rotation and key revocation.

The [evaluation guide](docs/evaluations.md) covers release comparison, human scoring and reviewed Prompt/Skill improvements.



