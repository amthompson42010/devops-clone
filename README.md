# DevOps Clone

A self-hosted, Azure DevOps–style app with three areas per project:

| Area | Modeled after | What you get |
|------|---------------|--------------|
| **Repos** | Azure Repos | Real Git repositories (clone / fetch / push over HTTP), file browser with syntax highlighting, README rendering, in-browser edit/upload/delete with commits, commit history and diffs, branches (ahead/behind, default, delete), pull requests (diff, inline + general comments, votes, merge or squash, conflict detection) |
| **Boards** | Jira Software | Backlog with sprints and drag-and-drop ranking, Kanban board for the active sprint (drag between columns, swimlanes by assignee/epic, WIP limits), epics panel, issue detail modal (rich-text description, subtasks, comments, history, "Development" panel linking commits/PRs that mention the key), issue navigator, configurable columns |
| **Wiki** | Confluence | Page tree, WYSIWYG editor (headings, tables, task lists, code blocks…), page templates (meeting notes, decision, requirements, how-to, retro), version history with preview/restore, comments with replies, likes, labels, move, search |

**Storage is pluggable:**

- **Local (default for development)** — everything is written to `.data/` in the project folder. No Azure account needed.
- **Azure Blob Storage** — set `STORAGE=azure` and a connection string; the exact same layout is stored as blobs.

Either way, Git repos, work items, sprints, wiki pages and page history all go through the same storage layer (with ETag-based concurrency in both modes). The server also keeps a disposable cache of each bare repo (`.git-cache/`) so the real `git` binary can serve clone/push; delete it any time and it is rebuilt from storage.

## Requirements

- Node.js 20+
- Git 2.38+ on the PATH (Git for Windows is fine) — used for `git http-backend` and `git merge-tree --write-tree`
- An Azure Storage account — only if you want `STORAGE=azure`

## Setup (Windows / macOS / Linux)

```bash
cd devops-clone
npm install
copy .env.example .env        # macOS/Linux: cp .env.example .env
```

The default `.env` uses **local storage** (`STORAGE=local`, data in `.data/`), so you can run immediately.

To use Azure instead, edit `.env`:

```ini
STORAGE=azure
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
```

(Azure Portal → your storage account → **Security + networking → Access keys → Connection string**.) The containers `devops-data` and `devops-repos` are created automatically. The server prints which storage it is using on startup.

> Local data and Azure data are separate. To move local data to Azure, upload the contents of `.data/devops-data` and `.data/devops-repos` into the containers of the same names (e.g. with Azure Storage Explorer or `az storage blob upload-batch`), then delete `.git-cache/`.

### Development

```bash
npm run dev
```

- UI: http://localhost:5173 (Vite, hot reload)
- API + Git: http://localhost:4000

### Production-style

```bash
npm run build
npm start
```

Everything is then served from http://localhost:4000.

## Hosting on GitHub Pages (no server)

The app also builds as a fully static site. In this mode there is no backend at all:

- **Data is stored in your browser** (IndexedDB) — projects, boards, wiki and Git repositories. It is per-browser and per-device, not shared with other people.
- **Git runs in the browser** ([isomorphic-git](https://isomorphic-git.org)). Files, commits, diffs, branches, pull requests and merges all work in the UI. Terminal `git clone`/`push` is not available; instead use **Download ZIP** and **Import ZIP** (New ▸ Import ZIP, or on an empty repo).
- Use the **Browser storage** menu (top right) to **download a backup**, **restore** one (e.g. on another computer), or delete all data. Back up regularly — clearing site data in the browser erases everything.
- URLs use `#/` (e.g. `https://you.github.io/devops-clone/#/PROJ/boards/board`) so deep links work on Pages.

### Deploy

1. Push this folder to a GitHub repository (branch `main`).
2. In the repo go to **Settings ▸ Pages ▸ Build and deployment ▸ Source** and choose **GitHub Actions**.
3. The included workflow `.github/workflows/deploy-pages.yml` builds with `npm run build:pages` and publishes `client/dist` on every push to `main`. Your site appears at `https://<user>.github.io/<repo>/`.

### Try the static build locally

```bash
npm run dev:browser          # dev server, browser-only mode
npm run build:pages          # production static build in client/dist
npm run preview -w client -- --mode browser   # serve the built client/dist
```

The same route code powers both modes: in the static build, `server/src/routes/*` is bundled into the app with its storage and Git layers swapped for browser implementations (`client/src/local/`).

## Uploading changes (folder or .zip)

In **Repos ▸ Files**, click **Upload changes** (or drag & drop onto the dialog). You can pick a **folder**, individual **files**, or a **.zip** (a single top-level folder, like GitHub's "Download ZIP", is stripped automatically; `.git`, `node_modules` and OS junk files are skipped).

The upload is compared with the stored source by Git blob hash and shown as a preview: **added**, **modified**, **unchanged**. Uploads are merged as an **overlay** — only added/changed files are committed, and files that aren't in the upload are left untouched (nothing is deleted). Commit straight to the branch, or to a new branch with a pull request.

## Deploying to Azure App Service

Each repo has a **Deployments** page (and a **Deploy to Azure** button in the repo header):

1. **Sign in with Microsoft** (popup) — uses your own Azure permissions.
2. Pick the **directory** (if you have several), **subscription**, **resource group** and **App Service**.
3. Pick the **branch** and whether to **build on Azure** (sets `SCM_DO_BUILD_DURING_DEPLOYMENT=true` so App Service runs `npm install`/`pip install` etc.).
4. **Deploy** — progress streams into the dialog; every deployment is recorded with its log, and the last target is remembered for one-click **Redeploy**.

How the package reaches Azure (App Service's deployment endpoint doesn't accept calls straight from a browser):

| Mode | How it deploys |
|------|----------------|
| Server (`npm run dev` / `npm start`) | The browser hands the server your Azure token; the server zips the branch with `git archive` and pushes it to the app's Kudu **zipdeploy** API, then polls until it finishes. The token is only kept in memory for that job. |
| GitHub Pages | The browser uploads the zip to a **staging storage account** in the same resource group (pick one, or one is created automatically, and CORS is enabled for your Pages origin), then calls ARM **OneDeploy** so App Service pulls the package. The staged blob is deleted afterwards. |

Your account needs **Contributor** (or Website Contributor + Storage Account Contributor for the Pages path) on the resources.

### One-time: app registration for sign-in

1. Azure portal ▸ **Microsoft Entra ID ▸ App registrations ▸ New registration**.
2. Account types: *Accounts in any organizational directory* (or single tenant).
3. Redirect URI — platform **Single-page application (SPA)**:
   - local/server mode: `http://localhost:4000/redirect.html` (and `http://localhost:5173/redirect.html` for `npm run dev`)
   - GitHub Pages: `https://<user>.github.io/<repo>/redirect.html`
4. **API permissions ▸ Add ▸ Azure Service Management ▸ user_impersonation** (delegated).
5. Copy the **Application (client) ID**. Either paste it into the Deploy dialog the first time (stored in that browser), or bake it into builds with `VITE_AZURE_CLIENT_ID` (and optionally `VITE_AZURE_TENANT`) — e.g. as GitHub Actions variables passed to `npm run build:pages`.

## Using Git (server mode)

Each repo shows its clone URL (Clone button), e.g.

```bash
git clone http://localhost:4000/git/PROJ/MyRepo.git
```

Pushes are only acknowledged after the new objects and refs are uploaded to blob storage. Mention a work item key (e.g. `PROJ-12`) in a commit message, PR title or branch name and it appears in that issue's **Development** panel.

To require credentials for clone/push, set `GIT_HTTP_USER` and `GIT_HTTP_PASSWORD` in `.env`.

## Storage layout (blobs, or folders under `.data/` in local mode)

```
devops-data/
  meta/projects.json                      project list
  meta/users.json                         known users (for assignee pickers)
  projects/{KEY}/repos.json               repos in the project
  projects/{KEY}/board.json               issues, sprints, columns
  projects/{KEY}/pulls/{repo}.json        pull requests
  projects/{KEY}/wiki/index.json          page tree
  projects/{KEY}/wiki/pages/{id}.json     current page
  projects/{KEY}/wiki/history/{id}/NNNNNN.json   every published version
devops-repos/
  {KEY}/{repo}.git/...                    the bare repository, file-by-file
  {KEY}/{repo}.git.manifest.json          version + md5 of every file
```

Writes use ETag optimistic concurrency, so several server instances can share one storage account (each keeps its own cache and re-syncs from the manifest).

## Identity

There is no login. The first visit asks for a display name and email (stored in the browser); it's used for authorship, assignees and web commits. Put the app behind your own auth (e.g. Azure App Service Authentication or a reverse proxy) before exposing it beyond your machine/network.

## Project structure

```
server/   Express API, git smart-HTTP, blob storage layer
  src/blob.js        storage selection + JSON helpers with ETag retry
  src/localBlob.js   local-disk implementation of the blob container API
  src/gitStore.js    blob <-> local bare repo hydrate/sync, per-repo locks
  src/gitHttp.js     git http-backend bridge (clone/fetch/push)
  src/gitOps.js      browse, diff, web commits, branches, merge
  src/routes/        projects, repos (+PRs), boards, wiki
client/   React 18 + Vite
  src/local          browser backend for the GitHub Pages build (IndexedDB, isomorphic-git, mini router)
  src/pages/repos    Azure Repos UI
  src/pages/boards   Jira-style UI
  src/pages/wiki     Confluence-style UI
```
