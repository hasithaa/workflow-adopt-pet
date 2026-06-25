# Pet Adoption · Task Portal

A small React (Vite) UI for demoing the **human-task** use cases of the Adopt
Pet workflow. It talks directly to the Ballerina workflow **Management API**
(same contract as the reference `mock_ui`), so no extra backend is needed.

```
Browser (React SPA)  ──►  Workflow Management API  (assumed on :8234)
        (Vite proxy: /workflow → http://localhost:8234)
```

## Personas & roles

The top-bar user switcher is grouped by persona. There is **no role overlap**
between Shop and Shelter, and there are multiple users per role so you can show
task hand-off within a role.

| Persona | Users | Role |
|---|---|---|
| 🏪 **Shop** | ABC Shop — Owner / Clerk | `abc_shop` |
| 🏪 **Shop** | PQR Shop — Owner / Clerk | `pqr_shop` |
| 🏡 **Shelter** | Shelter Admin — Dana / Evan | `shelter_admin` |
| 🏡 **Shelter** | Shelter Worker — Priya / Sam | `shelter_worker` |

The selected user's `x-user-id` and `x-user-roles` headers go on every request.
The Management API uses the roles to decide `canComplete` on each task, so a
Shop user can only act on the **Select Pet** task and a `shelter_admin` only on
the **Approve Adoption** task.

> `shelter_worker` is included so you can switch to it, but it has **no UI
> task** — that step (branch-ready) is an HTTP callback handled outside this
> portal (typically by running the `curl` command printed by the backend). See
> workflow Step 6 in the root [`README`](../README.md).

## Two modes — Shop vs Shelter

Switching persona changes the whole mode (accent colour, navigation, landing
page):

- **🏪 Shop mode** — *initiators*. Shop users **start** adoption workflows,
  complete the **Select Pet** task, and track their own runs under **My
  Adoptions** with live status. They do not see other shops' runs.
  - `initiatedBy` and `initiatorRole` are **filled automatically by the App**
    from the signed-in user — they are not editable form fields. The workflow
    uses `initiatorRole` to route the Select-Pet task back to that shop's role
    (`abc_shop` vs `pqr_shop`).
- **🏡 Shelter mode** — *approvers & monitors*. `shelter_admin` users complete
  the **Approve Adoption** task and get an **Admin Console → Adoption Status**
  view of every adoption run and its live status. `shelter_worker` users have
  no UI tasks (their step is invoking the branch-ready callback).

## Pages

| Route | Page | Visible to |
|---|---|---|
| `/start` | Start a new adoption workflow (initiator auto-filled) | Shop |
| `/workflows` | My Adoptions — runs you started, with current status | Shop |
| `/tasks/pending` | Pending human tasks for the current user | all |
| `/tasks/completed` | Completed tasks | all |
| `/tasks` | All tasks | all |
| `/tasks/search` | Find a task by ID, or filter by status / name / parent | all |
| `/admin/workflows` | Adoption Status — all workflow runs + status filters | `shelter_admin` |
| `/workflows/:id/:runId` | Workflow detail — Shop sees status + input + output; `shelter_admin` additionally sees metadata, pending tasks, numbered activity timeline, and lifecycle actions | Shop (own) · `shelter_admin` |

## Running

```bash
npm install
npm run dev      # http://localhost:3100
```

The dev server proxies `/workflow/*` → `http://localhost:8234`. If your workflow
runs elsewhere, either edit `vite.config.js` or open the **connection** badge in
the top bar and set a full base URL (e.g. `http://localhost:9091/workflow`).

## Management API endpoints used

| Method | Path | Used by |
|---|---|---|
| `GET` | `/definitions` | Start Adoption |
| `POST` | `/workflows` | Start Adoption |
| `GET` | `/workflows` | Adoption Status (admin) |
| `GET` | `/workflows/{id}/{runId}` | Workflow detail |
| `GET` | `/workflows/{id}/{runId}/history` | Detail — derive input/output |
| `GET` | `/workflows/{id}/{runId}/activity-tree` | Detail — Activity Tree tab |
| `POST` | `/workflows/{id}/{runId}/{suspend\|resume\|cancel\|terminate}` | Detail — lifecycle actions |
| `GET` | `/human-tasks` | Task lists / search |
| `GET` | `/human-tasks/pending-count` | Sidebar badge |
| `GET` | `/human-tasks/{taskId}` | Task detail panel |
| `POST` | `/human-tasks/{taskId}/complete` | Complete task |
| `POST` | `/human-tasks/{taskId}/fail` | Reject / fail task |
| `POST` | `/human-tasks/{taskId}/cancel` | Cancel task |
