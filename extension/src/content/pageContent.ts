export function getPageContent(): string {
  const article = document.querySelector('article');
  const main = document.querySelector('main');
  const root = (article || main || document.body).cloneNode(true) as HTMLElement;

  root.querySelectorAll('script, style, nav, footer, header, noscript').forEach((el) => {
    el.remove();
  });

  const text = root.innerText || root.textContent || '';
  const normalized = text.replace(/\s+/g, ' ').trim();

  const maxLength = 10_000;
  if (normalized.length > maxLength) {
    return normalized.slice(0, maxLength);
  }

  return normalized;
}

