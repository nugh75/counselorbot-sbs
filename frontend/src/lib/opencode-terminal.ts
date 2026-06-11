import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

export interface TerminalSessionOptions {
  key: string;
  onStatus: (status: string) => void;
}

export interface TerminalSession {
  connect: (options: TerminalSessionOptions) => void;
  attach: (container: HTMLDivElement) => void;
  detach: () => void;
  destroy: () => void;
}

export function createTerminalSession(): TerminalSession {
  let term: XTerm | null = null;
  let fit: FitAddon | null = null;
  let ws: WebSocket | null = null;
  let inputDispose: { dispose(): void } | null = null;
  let ro: ResizeObserver | null = null;
  let onStatusCb: ((status: string) => void) | null = null;

  const onWindowResize = () => sendResize();

  function status(s: string) {
    try {
      onStatusCb?.(s);
    } catch {}
  }

  function ensureTerm() {
    if (term) return;
    term = new XTerm({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      theme: {
        background: '#0b0f17',
        foreground: '#e7ecf3',
        cursor: '#7dd3fc',
        selectionBackground: '#334155',
      },
      scrollback: 5000,
      allowProposedApi: true,
    });
    fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
  }

  function sendResize() {
    if (!term || !ws || ws.readyState !== 1 || !fit) return;
    const el = term.element;
    if (!el || el.clientWidth === 0 || el.clientHeight === 0) return; // Hidden
    try {
      fit.fit();
      ws.send(JSON.stringify({ t: 'resize', cols: term.cols, rows: term.rows }));
    } catch {}
  }

  function connect({ key, onStatus }: TerminalSessionOptions) {
    onStatusCb = onStatus;
    ensureTerm();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cols = term?.cols || 80;
    const rows = term?.rows || 24;

    // Connect to backend WS directly at /api/term (proxied by Nginx)
    ws = new WebSocket(
      `${proto}//${window.location.host}/api/term?mode=opencode&key=${encodeURIComponent(key)}&cols=${cols}&rows=${rows}`
    );
    status('connecting');

    ws.onopen = () => {
      status('connected');
      if (inputDispose) {
        try {
          inputDispose.dispose();
        } catch {}
      }
      if (term) {
        inputDispose = term.onData((d) => {
          if (ws && ws.readyState === 1) ws.send(d);
        });
      }
      setTimeout(() => {
        sendResize();
        try {
          term?.focus();
        } catch {}
      }, 300);
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        term?.write(ev.data);
      } else if (ev.data instanceof Blob) {
        ev.data.text().then((t) => term?.write(t));
      }
    };

    ws.onerror = () => status('error');
    ws.onclose = (ev) => {
      status(ev.code === 1008 || ev.code === 4403 ? 'forbidden' : 'closed');
    };
  }

  function attach(container: HTMLDivElement) {
    if (!term || !container) return;
    if (!term.element) {
      term.open(container);
    } else if (term.element.parentElement !== container) {
      container.appendChild(term.element);
    }
    if (ro) {
      ro.disconnect();
    }
    ro = new ResizeObserver(() => sendResize());
    ro.observe(container);
    window.addEventListener('resize', onWindowResize);
    setTimeout(() => {
      sendResize();
      try {
        term?.focus();
      } catch {}
    }, 40);
  }

  function detach() {
    if (ro) {
      ro.disconnect();
      ro = null;
    }
    window.removeEventListener('resize', onWindowResize);
    if (term?.element?.parentElement) {
      term.element.parentElement.removeChild(term.element);
    }
  }

  function destroy() {
    detach();
    try {
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ t: 'close' }));
      }
    } catch {}
    try {
      ws?.close();
    } catch {}
    ws = null;
    try {
      inputDispose?.dispose();
    } catch {}
    inputDispose = null;
    try {
      term?.dispose();
    } catch {}
    term = null;
    fit = null;
    onStatusCb = null;
  }

  return { connect, attach, detach, destroy };
}
