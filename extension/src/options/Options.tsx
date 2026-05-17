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
  const [showKey, setShowKey] = useState<boolean>(false);

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
          window.close();
        }, 800);
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
        <div className="doc-options-logo">💬</div>

        <header className="doc-options-header">
          <h1>PageChat</h1>
          <p>Enter your OpenAI API key to start chatting with any web page.</p>
        </header>

        <form className="doc-options-form" onSubmit={handleSave}>
          <label className="doc-options-field">
            <span className="doc-options-label">OpenAI API Key</span>
            <div className="doc-options-input-wrap">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="doc-options-eye"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </label>

          <div className="doc-options-footer">
            <button type="submit" className="doc-options-save-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save key'}
            </button>
            {status === 'saved' && <span className="doc-options-status doc-options-status--ok">Saved ✓</span>}
            {error && <span className="doc-options-status doc-options-status--error">{error}</span>}
          </div>
        </form>

        <p className="doc-options-hint">
          Your key is stored locally and never sent anywhere except OpenAI.{' '}
          <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
            Get a key →
          </a>
        </p>

        {!usingChromeStorage && (
          <p className="doc-options-devnote">
            Dev mode — values stored in <code>localStorage</code>.
          </p>
        )}
      </div>
    </div>
  );
}
