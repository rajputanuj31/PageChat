import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChatMessage, StorageData } from './api';
import { getStorage, loadHistory, saveHistory, sendChat } from './api';
import { getPageContent } from './pageContent';

const SUGGESTED_QUESTIONS = [
  'Summarize this page.',
  'What are the most important points?',
  'Give me key takeaways from this page.',
] as const;

function getInitialUrl(): string {
  return window.location.href;
}

function getPageId(url: string): string {
  try {
    const { origin, pathname, search } = new URL(url);
    return `${origin}${pathname}${search}`;
  } catch {
    return url;
  }
}

export function ChatPanel() {
  const [open, setOpen] = useState<boolean>(true);
  const [url, setUrl] = useState<string>(getInitialUrl);
  const pageId = useMemo(() => getPageId(url), [url]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<StorageData | null>(null);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const openOptions = useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ action: 'openOptions' });
  }, []);

  // Load settings on mount.
  useEffect(() => {
    void (async () => {
      try {
        const data = await getStorage();
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings.');
      }
    })();
  }, []);

  useEffect(() => {
    let lastHref = window.location.href;

    const checkUrlChange = () => {
      const current = window.location.href;
      if (current !== lastHref) {
        lastHref = current;
        setUrl(current);
      }
    };

    const intervalId = window.setInterval(checkUrlChange, 1000);
    window.addEventListener('popstate', checkUrlChange);
    window.addEventListener('hashchange', checkUrlChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('popstate', checkUrlChange);
      window.removeEventListener('hashchange', checkUrlChange);
    };
  }, []);

  // Load per-page history whenever pageId changes.
  useEffect(() => {
    if (!pageId) return;

    void (async () => {
      try {
        const history = await loadHistory(pageId);
        setMessages(history);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load history.');
      }
    })();

    // Always show the chat panel when we detect a new page.
    setOpen(true);
  }, [pageId]);

  // Persist history when messages change.
  useEffect(() => {
    if (!pageId || messages.length === 0) return;

    void saveHistory(pageId, messages);
  }, [messages, pageId]);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setInput(event.target.value);
    },
    [],
  );

  const sendQuestion = useCallback(
    async (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question || !pageId) return;

      const { apiKey } = settings ?? { apiKey: '' };
      if (!apiKey.trim()) {
        setError('Please add your OpenAI API key in the extension options page.');
        return;
      }

      setLoading(true);
      setError(null);

      const userMessage: ChatMessage = { role: 'user', content: question };
      setMessages((prev) => [...prev, userMessage]);

      const pageContent = getPageContent();
      const result = await sendChat({
        apiKey,
        url,
        question,
        pageContent,
      });

      if (result.error) {
        setError(result.error);
      } else if (result.answer) {
        const assistantMessage: ChatMessage = { role: 'assistant', content: result.answer };
        setMessages((prev) => [...prev, assistantMessage]);
      }

      setLoading(false);
    },
    [pageId, settings, url],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const question = input.trim();
      if (!question) return;

      setInput('');
      void sendQuestion(question);
    },
    [input, sendQuestion],
  );

  const disabled = loading || !input.trim();

  return (
    <>
      <button
        type="button"
        className="doc-chat-toggle"
        aria-label={open ? 'Close doc chat' : 'Open doc chat'}
        onClick={toggleOpen}
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="doc-chat-panel">
          <header className="doc-chat-header">
            <div className="doc-chat-title">
              <span className="doc-chat-title-main">PageChat</span>
              <span className="doc-chat-title-sub">{pageId}</span>
            </div>
          </header>

          <main className="doc-chat-body">
            <div className="doc-chat-main">
              {messages.length === 0 && !loading && !error && (
                <div className="doc-chat-empty">
                  <p>Ask anything about this page.</p>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  className={`doc-chat-msg doc-chat-msg--${message.role}`}
                >
                  <span className="doc-chat-msg-label">
                    {message.role === 'user' ? 'You' : 'AI'}
                  </span>
                  <div className="doc-chat-msg-content">{message.content}</div>
                </div>
              ))}

              {loading && (
                <div className="doc-chat-msg doc-chat-msg--assistant">
                  <span className="doc-chat-msg-label">AI</span>
                  <div className="doc-chat-msg-content doc-chat-loading">Thinking...</div>
                </div>
              )}

              {error && (
                <div className="doc-chat-error">
                  <span className="doc-chat-error-text">{error}</span>
                  {(!settings || !settings.apiKey) && (
                    <button
                      type="button"
                      className="doc-chat-error-link"
                      onClick={openOptions}
                      disabled={loading}
                    >
                      Open options
                    </button>
                  )}
                </div>
              )}
            </div>

            {messages.length === 0 && !loading && (
              <div className="doc-chat-suggestions">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    className="doc-chat-suggestion-link"
                    onClick={() => void sendQuestion(question)}
                    disabled={loading}
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
          </main>

          <footer className="doc-chat-footer">
            <form className="doc-chat-input-row" onSubmit={handleSubmit}>
              <input
                className="doc-chat-input"
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Ask something about this page..."
              />
              <button className="doc-chat-send" type="submit" disabled={disabled}>
                Send
              </button>
            </form>
          </footer>
        </div>
      )}
    </>
  );
}

