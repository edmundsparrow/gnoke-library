/*
 * Gnoke Library — db-core.js
 * Copyright (C) 2026 Edmund Sparrow <edmundsparrow@gmail.com>
 * Licensed under GNU GPL v3
 *
 * Core database engine.
 * Loads library.db via sql.js, persists to IndexedDB.
 * All db-library.js depends on this.
 */

const DB = (() => {

  const IDB_NAME    = 'gnoke_library_store';
  const IDB_VERSION = 1;
  const IDB_STORE   = 'db_file';
  const IDB_KEY     = 'library.db';
  const DB_URL      = 'data/library.db';

  const REQUIRED_TABLES = ['books', 'categories', 'borrows', 'settings'];

  let _db    = null;
  let _SQL   = null;
  let _dirty = false;

  // ── IndexedDB helpers ──────────────────────────────────────────────────────

  function _openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function _loadFromIDB() {
    const idb = await _openIDB();
    return new Promise((resolve, reject) => {
      const req = idb.transaction(IDB_STORE, 'readonly')
                     .objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function _saveToIDB(uint8) {
    const idb = await _openIDB();
    return new Promise((resolve, reject) => {
      const req = idb.transaction(IDB_STORE, 'readwrite')
                     .objectStore(IDB_STORE).put(uint8, IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ── Schema validation ──────────────────────────────────────────────────────

  function _getExistingTables(db) {
    const rows = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (!rows.length) return [];
    return rows[0].values.map(r => r[0]);
  }

  function _isSchemaCurrent(db) {
    const existing = _getExistingTables(db);
    return REQUIRED_TABLES.every(t => existing.includes(t));
  }

  // ── Initialisation ─────────────────────────────────────────────────────────

  async function init(sqlJsConfig = {}) {
    if (_db) return _db;

    _SQL = await initSqlJs(sqlJsConfig);

    const saved = await _loadFromIDB();

    if (saved) {
      const candidate = new _SQL.Database(saved);
      if (_isSchemaCurrent(candidate)) {
        _db = candidate;
        _db.run('PRAGMA foreign_keys = ON;');
        console.log('[DB] Loaded from IndexedDB — schema current');
      } else {
        candidate.close();
        console.warn('[DB] Schema outdated — reloading seed');
        const res = await fetch(DB_URL);
        if (!res.ok) throw new Error(`Seed DB fetch failed: ${res.status}`);
        _db = new _SQL.Database(new Uint8Array(await res.arrayBuffer()));
        _db.run('PRAGMA foreign_keys = ON;');
        await _saveToIDB(_db.export());
        console.log('[DB] Reloaded from seed');
      }
    } else {
      const res = await fetch(DB_URL);
      if (!res.ok) throw new Error(`Seed DB fetch failed: ${res.status}`);
      _db = new _SQL.Database(new Uint8Array(await res.arrayBuffer()));
      _db.run('PRAGMA foreign_keys = ON;');
      await _saveToIDB(_db.export());
      console.log('[DB] First run — seed DB loaded');
    }

    return _db;
  }

  // ── Query (SELECT) ─────────────────────────────────────────────────────────

  function query(sql, params = []) {
    if (!_db) throw new Error('[DB] Not initialised.');
    const result = _db.exec(sql, params);
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  }

  // ── Run (INSERT / UPDATE / DELETE) ─────────────────────────────────────────

  async function run(sql, params = []) {
    if (!_db) throw new Error('[DB] Not initialised.');
    _db.run(sql, params);
    _dirty = true;
    const lastId  = _db.exec('SELECT last_insert_rowid()')[0]?.values[0][0];
    const changes = _db.getRowsModified();
    await persist();
    return { changes, lastInsertRowid: lastId };
  }

  // ── Transaction ────────────────────────────────────────────────────────────

  async function transaction(fn) {
    if (!_db) throw new Error('[DB] Not initialised.');
    try {
      _db.run('BEGIN;');
      await fn(_runInTx);
      _db.run('COMMIT;');
      _dirty = true;
      await persist();
    } catch (err) {
      _db.run('ROLLBACK;');
      throw err;
    }
  }

  function _runInTx(sql, params = []) {
    _db.run(sql, params);
    return {
      changes:         _db.getRowsModified(),
      lastInsertRowid: _db.exec('SELECT last_insert_rowid()')[0]?.values[0][0],
    };
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  async function persist() {
    if (!_db || !_dirty) return;
    await _saveToIDB(_db.export());
    _dirty = false;
  }

  // ── Export / Restore ───────────────────────────────────────────────────────

  function exportDB(filename = 'gnoke-library-backup.db') {
    if (!_db) throw new Error('[DB] Not initialised.');
    const blob = new Blob([_db.export()], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restoreDB(file) {
    const uint8 = new Uint8Array(await file.arrayBuffer());
    if (_db) _db.close();
    _db = new _SQL.Database(uint8);
    _db.run('PRAGMA foreign_keys = ON;');
    await _saveToIDB(_db.export());
    console.log('[DB] Restored from file');
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-NG', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    init, query, run, transaction, persist,
    exportDB, restoreDB,
    today, formatDate,
  };

})();
