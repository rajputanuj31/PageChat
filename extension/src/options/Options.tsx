import { useCallback, useEffect, useState } from 'react';

const API_KEY_STORAGE_KEY = 'openai_api_key';
const BACKEND_URL_STORAGE_KEY = 'backend_url';
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8000';

type Status = 'idle' | 'saving' | 'saved' | 'error';

interface ChromeStorage {
  apiKey: string;
  backendUrl: string;
}

function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

async function readFromChrome(): Promise<ChromeStorage> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      [API_KEY_STORAGE_KEY, BACKEND_URL_STORAGE_KEY],
      (items: Record<string, unknown>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        const apiKey = (items[API_KEY_STORAGE_KEY] as string | undefined) ?? '';
        const backendUrlRaw =
          (items[BACKEND_URL_STORAGE_KEY] as string | undefined) ?? DEFAULT_BACKEND_URL;
        const backendUrl = backendUrlRaw.replace(/\/+$/, '');

        resolve({ apiKey, backendUrl });
      },
    );
  });
}

async function writeToChrome(apiKey: string, backendUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const normalizedBackendUrl = backendUrl.replace(/\/+$/, '');

    chrome.storage.local.set(
      {
        [API_KEY_STORAGE_KEY]: apiKey,
        [BACKEND_URL_STORAGE_KEY]: normalizedBackendUrl,
      },
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      },
    );
  });
}

export function Options() {
  const [apiKey, setApiKey] = useState<string>('');
  const [backendUrl, setBackendUrl] = useState<string>(DEFAULT_BACKEND_URL);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const usingChromeStorage = isChromeStorageAvailable();

  useEffect(() => {
    if (!usingChromeStorage) {
      // Dev mode: try localStorage if available.
      try {
        const storedApiKey = window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
        const storedBackendUrl =
          window.localStorage.getItem(BACKEND_URL_STORAGE_KEY) ?? DEFAULT_BACKEND_URL;
        setApiKey(storedApiKey);
        setBackendUrl(storedBackendUrl.replace(/\/+$/, ''));
      } catch {
        // ignore
      }
      return;
    }

    void (async () => {
      try {
        const data = await readFromChrome();
        setApiKey(data.apiKey);
        setBackendUrl(data.backendUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings.');
      }
    })();
  }, [usingChromeStorage]);

  const handleSave = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setStatus('saving');
      setError(null);

      try {
        if (usingChromeStorage) {
          await writeToChrome(apiKey, backendUrl);
        } else {
          window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
          window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, backendUrl.replace(/\/+$/, ''));
        }

        setStatus('saved');

        window.setTimeout(() => {
          setStatus('idle');
        }, 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save settings.');
        setStatus('error');
      }
    },
    [apiKey, backendUrl, usingChromeStorage],
  );

  const saving = status === 'saving';

  return (
    <div className="doc-options-root">
      <div className="doc-options-card">
        <header className="doc-options-header">
          <h1>PageChat</h1>
          <p>Configure how PageChat talks to your backend.</p>
        </header>

        <form className="doc-options-form" onSubmit={handleSave}>
          <label className="doc-options-field">
            <span className="doc-options-label">OpenAI API Key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-..."
            />
          </label>

          <label className="doc-options-field">
            <span className="doc-options-label">Backend URL</span>
            <input
              type="url"
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
              placeholder={DEFAULT_BACKEND_URL}
            />
          </label>

          <div className="doc-options-footer">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {status === 'saved' && <span className="doc-options-status doc-options-status--ok">Saved</span>}
            {error && <span className="doc-options-status doc-options-status--error">{error}</span>}
          </div>
        </form>

        {!usingChromeStorage && (
          <p className="doc-options-devnote">
            Running outside extension context. Values are stored in{' '}
            <code>localStorage</code> for development only.
          </p>
        )}
      </div>
    </div>
  );
}

