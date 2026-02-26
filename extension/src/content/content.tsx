import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatPanel } from './ChatPanel';
import './content.css';

const ROOT_ID = 'doc-chat-extension-root';

function mountChatPanel() {
  let container = document.getElementById(ROOT_ID);

  if (!container) {
    container = document.createElement('div');
    container.id = ROOT_ID;
    document.body.appendChild(container);
  }

  const root = createRoot(container);

  root.render(
    <StrictMode>
      <ChatPanel />
    </StrictMode>,
  );
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', mountChatPanel, { once: true });
} else {
  mountChatPanel();
}

