import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
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
  const [open, setOpen] = useState<boolean>(false);
  const [url, setUrl] = useState<string>(getInitialUrl);
  const pageId = useMemo(() => getPageId(url), [url]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<StorageData | null>(null);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const openOptions = useCallback(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;
    chrome.runtime.sendMessage({ action: 'openOptions' });
  }, []);

  // Load settings on mount and keep them in sync with storage changes.
  useEffect(() => {
    void (async () => {
      try {
        const data = await getStorage();
        setSettings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings.');
      }
    })();

    const onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>) => {
      if ('openai_api_key' in changes) {
        setSettings({ apiKey: (changes['openai_api_key'].newValue as string) ?? '' });
        setError(null);
      }
    };

    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => chrome.storage.onChanged.removeListener(onStorageChanged);
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

  }, [pageId]);

  // Persist history when messages change.
  useEffect(() => {
    if (!pageId || messages.length === 0) return;

    void saveHistory(pageId, messages);
  }, [messages, pageId]);

  // Scroll to bottom on new messages and while streaming.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
      setMessages((prev) => [...prev, userMessage, { role: 'assistant', content: '' }]);

      const pageContent = getPageContent();
      const result = await sendChat({
        apiKey,
        url,
        question,
        pageContent,
        onChunk: (chunk) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: updated[updated.length - 1].content + chunk,
            };
            return updated;
          });
          setLoading(false);
        },
      });

      if (result.error) {
        setMessages((prev) => prev.slice(0, -1));
        setError(result.error);
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

              {messages.map((message, index) => {
                const isAwaitingFirstToken =
                  loading &&
                  index === messages.length - 1 &&
                  message.role === 'assistant' &&
                  message.content === '';
                return (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    className={`doc-chat-msg doc-chat-msg--${message.role}`}
                  >
                    <span className="doc-chat-msg-label">
                      {message.role === 'user' ? 'You' : 'AI'}
                    </span>
                    <div className="doc-chat-msg-content">
                      {isAwaitingFirstToken ? (
                        <span className="doc-chat-loading">Thinking...</span>
                      ) : message.role === 'assistant' ? (
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      ) : (
                        message.content
                      )}
                    </div>
                  </div>
                );
              })}

              <div ref={bottomRef} />

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

