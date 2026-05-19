export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface StorageData {
  apiKey: string;
}

const API_KEY_STORAGE_KEY = 'openai_api_key';
const HISTORY_KEY_PREFIX = 'doc_chat_history_';
const BACKEND_URL = 'https://pagechat.onrender.com';

export async function getStorage(): Promise<StorageData> {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      reject(new Error('chrome.storage.local is not available'));
      return;
    }

    chrome.storage.local.get(
      [API_KEY_STORAGE_KEY],
      (items: Record<string, unknown>) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        const apiKey = (items[API_KEY_STORAGE_KEY] as string | undefined) ?? '';

        resolve({ apiKey });
      },
    );
  });
}

export async function saveStorage(partial: Partial<StorageData>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      reject(new Error('chrome.storage.local is not available'));
      return;
    }

    const updates: Record<string, string> = {};

    if (partial.apiKey !== undefined) {
      updates[API_KEY_STORAGE_KEY] = partial.apiKey;
    }

    chrome.storage.local.set(updates, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export async function loadHistory(pageId: string): Promise<ChatMessage[]> {
  const key = `${HISTORY_KEY_PREFIX}${pageId}`;

  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      resolve([]);
      return;
    }

    chrome.storage.local.get([key], (items: Record<string, unknown>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      const raw = items[key];
      if (!raw) {
        resolve([]);
        return;
      }

      try {
        const parsed = Array.isArray(raw) ? raw : JSON.parse(String(raw));
        resolve(parsed as ChatMessage[]);
      } catch {
        resolve([]);
      }
    });
  });
}

export async function saveHistory(pageId: string, messages: ChatMessage[]): Promise<void> {
  const key = `${HISTORY_KEY_PREFIX}${pageId}`;

  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      resolve();
      return;
    }

    chrome.storage.local.set({ [key]: messages }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

export interface SendChatResult {
  error?: string;
}

export async function sendChat(options: {
  apiKey?: string;
  url: string;
  question: string;
  pageContent?: string;
  onChunk: (chunk: string) => void;
}): Promise<SendChatResult> {
  const { apiKey, url, question, pageContent, onChunk } = options;

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60_000);

    const response = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        question,
        api_key: apiKey || undefined,
        page_content: pageContent,
      }),
      signal: controller.signal,
    });

    window.clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = 'Request failed.';
      try {
        const data = (await response.json()) as { detail?: string };
        if (data.detail) detail = data.detail;
      } catch {
        // ignore JSON parse errors
      }
      return { error: detail };
    }

    const reader = response.body?.getReader();
    if (!reader) return { error: 'No response body.' };

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are delimited by double newlines.
      // Hold any trailing incomplete event in the buffer.
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const line = event.trim();
        if (line.startsWith('data: ')) {
          try {
            onChunk(JSON.parse(line.slice(6)) as string);
          } catch {
            onChunk(line.slice(6));
          }
        }
      }
    }

    return {};
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { error: 'Request timed out.' };
    }

    return { error: error instanceof Error ? error.message : 'Unknown error.' };
  }
}

