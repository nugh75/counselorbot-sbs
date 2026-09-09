export type NotebookData = Partial<Record<
    'context' | 'goal' | 'main_difficulty' | 'strengths' | 'weaknesses' | 'notes'
    | 'gender' | 'age' | 'school_class' | 'school_year' | 'institution_slug', string>>;
export interface NotebookRevision {
    id: number;
    data: NotebookData;
    source: string;
    session_id?: string | null;
    created_at: string;
}
type Payload = { data: NotebookData; source: string; session_id: string | null };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

// One queue per account survives component unmounts during client navigation.
const queues = new Map<string, NotebookAutosave>();
export function notebookAutosave(username: string, revision: NotebookRevision | null,
    send: (payload: Payload) => Promise<NotebookRevision>, storage: Storage): NotebookAutosave {
    let queue = queues.get(username);
    if (!queue) {
        queue = new NotebookAutosave(username, revision, send, storage);
        queues.set(username, queue);
    } else if (!queue.pending && !queue.running) {
        queue.revision = revision;
        queue.data = revision?.data ?? {};
    }
    return queue;
}

export class NotebookAutosave {
    data: NotebookData;
    revision: NotebookRevision | null;
    status: SaveStatus = 'idle';
    pending: Payload | null = null;
    running: Promise<boolean> | null = null;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private listeners = new Set<() => void>();
    private key: string;
    private send: (payload: Payload) => Promise<NotebookRevision>;
    private storage: Storage;

    constructor(username: string, revision: NotebookRevision | null,
        send: (payload: Payload) => Promise<NotebookRevision>, storage: Storage) {
        this.key = `cb_notebook_draft_v1:${username}`;
        this.send = send;
        this.storage = storage;
        this.revision = revision;
        this.data = revision?.data ?? {};
        try {
            const saved = JSON.parse(storage.getItem(this.key) || 'null');
            if (saved?.data && typeof saved.data === 'object' && !Array.isArray(saved.data)
                && Object.values(saved.data).every(value => typeof value === 'string')
                && typeof saved.source === 'string') {
                this.pending = saved;
                this.data = saved.data;
                this.status = 'pending';
            }
        } catch { /* Storage unavailable: keep the in-memory queue and server save. */ }
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    private notify() { this.listeners.forEach(listener => listener()); }

    update(data: NotebookData, source: string, sessionId?: string) {
        this.data = { ...data };
        this.pending = { data: this.data, source, session_id: sessionId || null };
        // Synchronous draft persistence closes the debounce/navigation loss window.
        try { this.storage.setItem(this.key, JSON.stringify(this.pending)); } catch { /* Server still saves. */ }
        this.status = 'pending';
        this.notify();
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.flush(); }, 600);
    }

    flush(): Promise<boolean> {
        clearTimeout(this.timer);
        if (this.running) return this.running;
        this.running = this.drain().finally(() => { this.running = null; });
        return this.running;
    }

    private async drain(): Promise<boolean> {
        while (this.pending) {
            const sent = this.pending;
            this.status = 'saving';
            this.notify();
            try {
                this.revision = await this.send(sent);
                if (this.pending === sent) {
                    this.pending = null;
                    try {
                        if (this.storage.getItem(this.key) === JSON.stringify(sent)) this.storage.removeItem(this.key);
                    } catch { /* A retained draft is safe to retry; the API deduplicates it. */ }
                }
                // Do not replace data with an older response while the user types.
                this.status = this.pending ? 'pending' : 'saved';
                this.notify();
            } catch {
                this.status = 'error';
                this.notify();
                return false;
            }
        }
        return true;
    }

    reset() {
        clearTimeout(this.timer);
        this.pending = null;
        this.data = {};
        this.revision = null;
        this.status = 'idle';
        try { this.storage.removeItem(this.key); } catch { /* Storage may be disabled. */ }
        this.notify();
    }
}
