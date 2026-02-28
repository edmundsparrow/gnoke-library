/*
 * Gnoke Library — db-library.js
 * Copyright (C) 2026 Edmund Sparrow <edmundsparrow@gmail.com>
 * Licensed under GNU GPL v3
 *
 * Data access layer for:
 *   - Books (CRUD)
 *   - Categories (CRUD)
 *   - Borrows (record, return, history)
 *   - Stats / summary
 *   - Settings
 *
 * Depends on db-core.js
 */

const DBLib = (() => {

  // ── Books ──────────────────────────────────────────────────────────────────

  function getAllBooks() {
    return DB.query('SELECT * FROM books ORDER BY title ASC');
  }

  function getBook(id) {
    return DB.query('SELECT * FROM books WHERE id = ?', [id])[0] || null;
  }

  function searchBooks(term) {
    const t = `%${term}%`;
    return DB.query(`
      SELECT * FROM books
      WHERE title LIKE ? OR author LIKE ? OR isbn LIKE ? OR category LIKE ?
      ORDER BY title ASC
    `, [t, t, t, t]);
  }

  async function addBook({ title, author, isbn = '', category, copies = 1 }) {
    // Check if exact same title+isbn exists → increment copies instead
    const existing = DB.query(
      `SELECT * FROM books WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) AND LOWER(TRIM(isbn)) = LOWER(TRIM(?))`,
      [title, isbn]
    )[0];

    if (existing) {
      await DB.run('UPDATE books SET copies = copies + ? WHERE id = ?', [copies, existing.id]);
      return { id: existing.id, merged: true, copies: existing.copies + copies };
    }

    const result = await DB.run(
      `INSERT INTO books (title, author, isbn, category, copies) VALUES (?, ?, ?, ?, ?)`,
      [title, author, isbn, category, copies]
    );
    return { id: result.lastInsertRowid, merged: false, copies };
  }

  async function updateBook(id, { title, author, category }) {
    await DB.run(
      'UPDATE books SET title = ?, author = ?, category = ? WHERE id = ?',
      [title, author, category, id]
    );
  }

  async function deleteBook(id) {
    // Guard: don't delete if active borrows exist
    const active = DB.query(
      'SELECT id FROM borrows WHERE book_id = ? AND return_date IS NULL LIMIT 1', [id]
    );
    if (active.length) throw new Error('Book has active loans — return all copies first.');
    await DB.run('DELETE FROM books WHERE id = ?', [id]);
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  function getAllCategories() {
    return DB.query('SELECT * FROM categories ORDER BY name ASC');
  }

  async function addCategory(name) {
    const exists = DB.query(
      'SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))', [name]
    )[0];
    if (exists) throw new Error('Category already exists.');
    const result = await DB.run('INSERT INTO categories (name) VALUES (?)', [name]);
    return result.lastInsertRowid;
  }

  async function updateCategory(id, newName) {
    const dup = DB.query(
      'SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?', [newName, id]
    )[0];
    if (dup) throw new Error('Category name already exists.');

    const old = DB.query('SELECT name FROM categories WHERE id = ?', [id])[0];
    if (!old) throw new Error('Category not found.');

    await DB.transaction(async tx => {
      tx('UPDATE categories SET name = ? WHERE id = ?', [newName, id]);
      tx('UPDATE books SET category = ? WHERE LOWER(TRIM(category)) = LOWER(TRIM(?))', [newName, old.name]);
    });
  }

  async function deleteCategory(id) {
    const cat = DB.query('SELECT name FROM categories WHERE id = ?', [id])[0];
    if (!cat) throw new Error('Category not found.');
    const used = DB.query(
      'SELECT id FROM books WHERE LOWER(TRIM(category)) = LOWER(TRIM(?)) LIMIT 1', [cat.name]
    )[0];
    if (used) throw new Error('Category is used by one or more books.');
    await DB.run('DELETE FROM categories WHERE id = ?', [id]);
  }

  // ── Borrows ────────────────────────────────────────────────────────────────

  async function recordBorrow({ bookId, borrower, dateOut, dueDate }) {
    const book = getBook(bookId);
    if (!book) throw new Error('Book not found.');
    if (book.copies < 1) throw new Error('No copies available.');

    await DB.transaction(async tx => {
      tx(
        `INSERT INTO borrows (book_id, borrower, date_out, due_date) VALUES (?, ?, ?, ?)`,
        [bookId, borrower, dateOut, dueDate]
      );
      tx('UPDATE books SET copies = copies - 1 WHERE id = ?', [bookId]);
    });
  }

  async function recordReturn({ borrowId, bookId, returnDate }) {
    await DB.transaction(async tx => {
      tx('UPDATE borrows SET return_date = ? WHERE id = ?', [returnDate, borrowId]);
      tx('UPDATE books SET copies = copies + 1 WHERE id = ?', [bookId]);
    });
  }

  function getActiveBorrows() {
    return DB.query(`
      SELECT b.id, b.borrower, b.date_out, b.due_date,
             bk.id AS book_id, bk.title AS book_title
      FROM borrows b
      JOIN books bk ON bk.id = b.book_id
      WHERE b.return_date IS NULL
      ORDER BY b.due_date ASC
    `);
  }

  function getActiveBorrowsByBorrower(borrower) {
    return DB.query(`
      SELECT b.id, b.borrower, b.date_out, b.due_date,
             bk.id AS book_id, bk.title AS book_title
      FROM borrows b
      JOIN books bk ON bk.id = b.book_id
      WHERE b.return_date IS NULL AND b.borrower = ?
      ORDER BY b.due_date ASC
    `, [borrower]);
  }

  function getUniqueBorrowers() {
    return DB.query(`
      SELECT DISTINCT borrower FROM borrows
      WHERE return_date IS NULL
      ORDER BY borrower ASC
    `).map(r => r.borrower);
  }

  function getAllBorrows(search = '') {
    const t = `%${search}%`;
    return DB.query(`
      SELECT b.id, b.borrower, b.date_out, b.due_date, b.return_date,
             bk.title AS book_title, bk.id AS book_id
      FROM borrows b
      JOIN books bk ON bk.id = b.book_id
      WHERE b.borrower LIKE ? OR bk.title LIKE ? OR bk.isbn LIKE ?
      ORDER BY b.date_out DESC
    `, [t, t, t]);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  function getStats() {
    const totalCopies = DB.query('SELECT COALESCE(SUM(copies),0) AS n FROM books')[0]?.n || 0;
    const totalTitles = DB.query('SELECT COUNT(*) AS n FROM books')[0]?.n || 0;
    const activeLoans = DB.query('SELECT COUNT(*) AS n FROM borrows WHERE return_date IS NULL')[0]?.n || 0;
    const returnedLoans = DB.query('SELECT COUNT(*) AS n FROM borrows WHERE return_date IS NOT NULL')[0]?.n || 0;
    const today = DB.today();
    const overdueCount = DB.query(
      `SELECT COUNT(*) AS n FROM borrows WHERE return_date IS NULL AND due_date < ?`, [today]
    )[0]?.n || 0;

    const topBooks = DB.query(`
      SELECT bk.title, bk.author, COUNT(b.id) AS borrow_count
      FROM borrows b
      JOIN books bk ON bk.id = b.book_id
      GROUP BY b.book_id
      ORDER BY borrow_count DESC
      LIMIT 5
    `);

    const dueToday = DB.query(`
      SELECT b.borrower, bk.title
      FROM borrows b
      JOIN books bk ON bk.id = b.book_id
      WHERE b.return_date IS NULL AND b.due_date = ?
    `, [today]);

    return { totalCopies, totalTitles, activeLoans, returnedLoans, overdueCount, topBooks, dueToday };
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  function getSetting(key) {
    const row = DB.query('SELECT value FROM settings WHERE key = ?', [key])[0];
    return row ? row.value : null;
  }

  async function saveSetting(key, value) {
    await DB.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  }

  // ── Reset demo data ────────────────────────────────────────────────────────

  async function resetToFresh() {
    await DB.transaction(async tx => {
      tx('DELETE FROM borrows');
      tx('DELETE FROM books');
      tx('DELETE FROM categories');
      tx('DELETE FROM settings');
    });
    await saveSetting('demo_cleared', '1');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    // Books
    getAllBooks, getBook, searchBooks, addBook, updateBook, deleteBook,
    // Categories
    getAllCategories, addCategory, updateCategory, deleteCategory,
    // Borrows
    recordBorrow, recordReturn,
    getActiveBorrows, getActiveBorrowsByBorrower, getUniqueBorrowers, getAllBorrows,
    // Stats
    getStats,
    // Settings
    getSetting, saveSetting,
    // Reset
    resetToFresh,
  };

})();
