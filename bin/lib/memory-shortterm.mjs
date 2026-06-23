let _nextId = 1;

function generateId() {
  return `stm_${Date.now()}_${_nextId++}`;
}

export class ShortTermMemory {
  constructor({ windowSize = 20, overlapSize = 3 } = {}) {
    this.windowSize = windowSize;
    this.overlapSize = overlapSize;
    this.sessions = new Map();
  }

  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        entries: [],
        summary: null
      });
    }
    return this.sessions.get(sessionId);
  }

  addEntry(sessionId, entry) {
    const session = this.getSession(sessionId);
    const record = {
      id: generateId(),
      timestamp: Date.now(),
      ...entry
    };
    session.entries.push(record);

    if (session.entries.length > this.windowSize) {
      this.compress(sessionId);
    }

    return record;
  }

  getRecent(sessionId, count = 10) {
    const session = this.getSession(sessionId);
    return session.entries.slice(-count);
  }

  compress(sessionId) {
    const session = this.getSession(sessionId);
    if (session.entries.length <= this.windowSize) {
      return;
    }

    const overflow = session.entries.length - this.windowSize;
    const toCompress = session.entries.slice(0, overflow + this.overlapSize);
    const keep = session.entries.slice(overflow);

    const compressedText = toCompress
      .map((e) => e.text ?? e.content ?? JSON.stringify(e))
      .join("\n");

    const newSummary = session.summary
      ? `${session.summary}\n---\n${compressedText}`
      : compressedText;

    session.summary = newSummary;
    session.entries = keep;
  }

  getSummary(sessionId) {
    const session = this.getSession(sessionId);
    return session.summary;
  }

  clear(sessionId) {
    this.sessions.delete(sessionId);
  }

  clearAll() {
    this.sessions.clear();
  }
}

export const globalShortTermMemory = new ShortTermMemory();
