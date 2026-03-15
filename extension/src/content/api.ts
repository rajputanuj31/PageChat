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
  answer?: string;
  error?: string;
}

interface BackendChatResponse {
  answer: string;
}

export async function sendChat(options: {
  apiKey?: string;
  url: string;
  question: string;
  pageContent?: string;
}): Promise<SendChatResult> {
  const { apiKey, url, question, pageContent } = options;

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        question,
        api_key: apiKey || undefined,
        // In the current backend we ignore pageContent, but it is ready for future use.
        page_content: pageContent,
      }),
      signal: controller.signal,
    });

    window.clearTimeout(timeoutId);

    if (!response.ok) {
      let detail = 'Request failed.';
      try {
        const data = (await response.json()) as { detail?: string };
        if (data.detail) {
          detail = data.detail;
        }
      } catch {
        // ignore JSON parse errors
      }
      return { error: detail };
    }

    const data = (await response.json()) as BackendChatResponse;
    return { answer: data.answer };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { error: 'Request timed out.' };
    }

    return { error: error instanceof Error ? error.message : 'Unknown error.' };
  }
}

