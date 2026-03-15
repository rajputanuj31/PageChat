import { useCallback, useEffect, useState } from 'react';

const API_KEY_STORAGE_KEY = 'openai_api_key';

type Status = 'idle' | 'saving' | 'saved' | 'error';

function isChromeStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.storage?.local;
}

async function readApiKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      [API_KEY_STORAGE_KEY],
      (items: Record<string, unknown>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve((items[API_KEY_STORAGE_KEY] as string | undefined) ?? '');
      },
    );
  });
}

async function writeApiKey(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(
      { [API_KEY_STORAGE_KEY]: apiKey },
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
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const usingChromeStorage = isChromeStorageAvailable();

  useEffect(() => {
    if (!usingChromeStorage) {
      try {
        const storedApiKey = window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? '';
        setApiKey(storedApiKey);
      } catch {
        // ignore
      }
      return;
    }

    void (async () => {
      try {
        const key = await readApiKey();
        setApiKey(key);
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
          await writeApiKey(apiKey);
        } else {
          window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
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
    [apiKey, usingChromeStorage],
  );

  const saving = status === 'saving';

  return (
    <div className="doc-options-root">
      <div className="doc-options-card">
        <header className="doc-options-header">
          <h1>PageChat</h1>
          <p>Enter your OpenAI API key to start chatting with any web page.</p>
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

          <div className="doc-options-footer">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {status === 'saved' && <span className="doc-options-status doc-options-status--ok">Saved ✓</span>}
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
