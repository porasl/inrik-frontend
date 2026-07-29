const root = document.getElementById('root');

function showStartupError(error) {
  const message = String(error?.message || error?.reason?.message || error?.reason || error || 'Unknown startup error');
  console.error('Storefront startup failed:', error);

  if (!root || root.dataset.startupError === 'true') return;
  root.dataset.startupError = 'true';
  root.innerHTML = `
    <main style="max-width:760px;margin:80px auto;padding:24px;font-family:system-ui,sans-serif">
      <h1 style="font-size:24px">Storefront could not start</h1>
      <p>Please reload this page. If the problem continues, report the message below:</p>
      <pre style="white-space:pre-wrap;padding:16px;border:1px solid #dc3545;border-radius:8px;background:#fff5f5;color:#842029">${message.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character])}</pre>
      <button type="button" style="padding:8px 16px" onclick="location.reload()">Reload</button>
    </main>
  `;
}

globalThis.addEventListener('error', (event) => showStartupError(event.error || event.message));
globalThis.addEventListener('unhandledrejection', (event) => showStartupError(event.reason));

import('./main.jsx').catch(showStartupError);
