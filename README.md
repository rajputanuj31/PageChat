# PageChat

PageChat is a Chrome extension that lets you **chat with any web page**.  
It injects a small React panel into pages you visit, sends the page content to a FastAPI + LangChain backend, and returns OpenAI‑powered answers.

---

## Project structure

- `backend/` – FastAPI + LangChain backend
  - `app.py` – FastAPI app (`/chat`, `/health`) and CORS setup.
  - `doc_chain.py` – LangChain pipeline: loads the page, chunks it, builds a FAISS index, and queries OpenAI.
  - `requirements.txt` – Python dependencies.
- `extension/` – Chrome MV3 extension (React + Vite + TypeScript)
  - `public/manifest.json` – Extension manifest (content script + options page).
  - `src/content/` – Content script entry, chat UI and helpers.
  - `src/options/` – Options page for configuring backend URL and API key.

---

## Backend (FastAPI)

### Local development

From `backend/`:

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1

pip install --upgrade pip
pip install -r requirements.txt

uvicorn app:app --reload
```

The backend will be available at `http://127.0.0.1:8000`:

- `GET /health` – simple health check.
- `POST /chat` – main endpoint used by the extension.

`/chat` expects JSON:

```json
{
  "url": "https://example.com/article",
  "question": "Summarize this page.",
  "api_key": "sk-..."
}
```

The `api_key` is typically supplied by the extension and is passed through to `langchain_openai`.  
If you prefer, you can also set `OPENAI_API_KEY` as an environment variable for local testing.

### Deploying (e.g. Render)

- Use `backend/` as the service root.
- Install from `requirements.txt`.
- Start command:

```bash
uvicorn app:app --host 0.0.0.0 --port $PORT
```

- In production, set **CORS** origins in `app.py` as tightly as you need (currently `allow_origins=["*"]` for simplicity).

---

## Extension (Chrome MV3, React + Vite)

### Install dependencies

From `extension/`:

```bash
npm install
```

### Build

```bash
npm run build
```

This runs TypeScript and builds:

- The **options page** (via `vite.config.ts`).
- The **content script** (`content.js` + `content.css`, via `vite.content.config.ts`).

Artifacts are written to `extension/dist/`.

### Load the extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `extension/dist/`.

The extension injects a PageChat panel on `*://*/*` pages (per `manifest.json`).

### Configure backend URL and API key

1. Open the extension’s **Options** page (from Chrome’s extension details or via the “Open options” link in the panel when there is an API key error).
2. Set:
   - **OpenAI API Key** – your OpenAI key (stored in `chrome.storage.local`).
   - **Backend URL** – either:
     - `http://127.0.0.1:8000` for local development, or
     - Your deployed backend URL (e.g. `https://your-app.onrender.com`).
3. Save. The content script will read these values on each page.

---

## How it works (high level)

1. On matching pages, the content script:
   - Mounts a React `<ChatPanel />` into the DOM.
   - Extracts page text with a simple heuristic (`article` → `main` → `body`).
2. When you ask a question:
   - PageChat collects:
     - Current URL.
     - The question.
     - Extracted page content (optional field today).
     - Your API key (from `chrome.storage.local`).
   - Sends a `POST /chat` request to the backend.
3. The backend:
   - Uses `WebBaseLoader` to fetch the page.
   - Splits it into chunks with `RecursiveCharacterTextSplitter`.
   - Builds a FAISS vector store, retrieves relevant chunks, and calls OpenAI via LangChain.
   - Returns a plain‑text answer.
4. The extension renders your message on the right and the AI answer on the left, and persists history per URL in `chrome.storage.local`.

---

## Naming

- Extension display name: **PageChat** (see `extension/public/manifest.json`).
- Backend FastAPI app title: **PageChat Backend**.

---

## Notes & future improvements

- Add a simple in‑memory cache in the backend keyed by URL to speed up repeat questions.
- Tighten CORS and `host_permissions` once you know your final deployment domains.
- Consider a background script or hosted proxy if you want to avoid any localhost/network prompts entirely.

