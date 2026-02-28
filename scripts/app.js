/*
 * Gnoke Library — app.js
 * Copyright (C) 2026 Edmund Sparrow <edmundsparrow@gmail.com>
 * Licensed under GNU GPL v3
 *
 * Main application controller.
 * Replaces s1.js through s7.js.
 * Depends on db-core.js and db-library.js.
 */

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await DB.init({
      locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
    });
    initApp();
  } catch (err) {
    console.error('[App] DB init failed:', err);
    showToast('Database failed to load. Please refresh.', 'error');
  }
});

function initApp() {
  setDefaultDates();
  setupNav();
  setupForms();
  setupSearch();
  setupModals();
  setupRestore();
  loadPage('main-page');

  // Show demo banner if demo hasn't been cleared
  // Initialise notifications (must be after DB is ready)
  Notify.init();

  if (!DBLib.getSetting('demo_cleared')) {
    document.getElementById('demo-banner').style.display = 'flex';
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────

function setupNav() {
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      loadPage(page);
      // mobile: close drawer if open
      document.getElementById('nav-drawer')?.classList.remove('open');
      document.getElementById('nav-overlay')?.classList.remove('show');
    });
  });

  // Hamburger
  const burger = document.getElementById('burger-btn');
  const drawer = document.getElementById('nav-drawer');
  const overlay = document.getElementById('nav-overlay');
  if (burger && drawer) {
    burger.addEventListener('click', () => {
      drawer.classList.toggle('open');
      overlay?.classList.toggle('show');
    });
    overlay?.addEventListener('click', () => {
      drawer.classList.remove('open');
      overlay.classList.remove('show');
    });
  }
}

function loadPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('[data-page]').forEach(b => b.classList.remove('active'));

  const page = document.getElementById(pageId);
  if (page) page.classList.add('active');

  document.querySelectorAll(`[data-page="${pageId}"]`).forEach(b => b.classList.add('active'));

  switch (pageId) {
    case 'main-page':    renderBooks(); break;
    case 'history-page': renderHistory(); break;
    case 'return-page':  renderReturnForm(); break;
    case 'config-page':  renderConfig(); break;
    case 'about-page':   renderAbout(); break;
  }
}

// ── Books — Main Page ──────────────────────────────────────────────────────

function renderBooks(search = '') {
  const books = search ? DBLib.searchBooks(search) : DBLib.getAllBooks();
  const tbody = document.querySelector('#books-table tbody');
  const count = document.getElementById('book-count');

  if (count) count.textContent = books.length;

  if (!tbody) return;
  tbody.innerHTML = '';

  if (!books.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No books found</td></tr>`;
    return;
  }

  books.forEach((book, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="num">${i + 1}</td>
      <td>${esc(book.author)}</td>
      <td class="book-title">${esc(book.title)}</td>
      <td class="hide-sm">${esc(book.isbn || '—')}</td>
      <td><span class="chip">${esc(book.category)}</span></td>
      <td class="center">${book.copies}</td>
      <td class="action-cell">
        <button class="btn-icon btn-edit" title="Edit" onclick="openEditBookModal(${book.id})">✏️</button>
        <button class="btn-icon btn-del" title="Delete" onclick="handleDeleteBook(${book.id})">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ── History Page ───────────────────────────────────────────────────────────

function renderHistory(search = '') {
  const records = DBLib.getAllBorrows(search);
  const tbody = document.querySelector('#history-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!records.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">No records found</td></tr>`;
    return;
  }

  const today = DB.today();
  records.forEach(r => {
    const isOverdue = !r.return_date && r.due_date < today;
    const tr = document.createElement('tr');
    if (isOverdue) tr.classList.add('overdue');

    let statusHtml;
    if (r.return_date) {
      statusHtml = `<span class="status status-returned">Returned</span>`;
    } else if (isOverdue) {
      statusHtml = `<span class="status status-overdue">Overdue</span>`;
    } else {
      statusHtml = `<span class="status status-borrowed">Borrowed</span>`;
    }

    tr.innerHTML = `
      <td>${esc(r.borrower)}</td>
      <td class="book-title">${esc(r.book_title)}</td>
      <td class="hide-sm">${fmtDate(r.date_out)}</td>
      <td>${fmtDate(r.due_date)}</td>
      <td class="hide-sm">${r.return_date ? fmtDate(r.return_date) : '—'}</td>
      <td>${statusHtml}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Return Form ────────────────────────────────────────────────────────────

function renderReturnForm() {
  const borrowerSel = document.getElementById('return-borrower-select');
  if (!borrowerSel) return;

  const borrowers = DBLib.getUniqueBorrowers();
  borrowerSel.innerHTML = '<option value="">Select Borrower</option>';
  borrowers.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b; opt.textContent = b;
    borrowerSel.appendChild(opt);
  });

  // Clear book select
  const bookSel = document.getElementById('return-book-select');
  if (bookSel) bookSel.innerHTML = '<option value="">Select Book</option>';
}

function handleBorrowerChange() {
  const borrower = document.getElementById('return-borrower-select')?.value;
  const bookSel  = document.getElementById('return-book-select');
  if (!bookSel) return;

  bookSel.innerHTML = '<option value="">Select Book</option>';
  if (!borrower) return;

  const borrows = DBLib.getActiveBorrowsByBorrower(borrower);
  borrows.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; // borrow record id
    opt.textContent = b.book_title;
    opt.dataset.bookId = b.book_id;
    bookSel.appendChild(opt);
  });
}

// ── Config Page ────────────────────────────────────────────────────────────

function renderConfig() {
  renderCategorySelects();
  renderCategoryList();
}

function renderCategorySelects() {
  const cats = DBLib.getAllCategories();
  ['add-book-category', 'edit-book-category'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Select Category</option>';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name; opt.textContent = c.name;
      sel.appendChild(opt);
    });
    sel.value = prev;
  });

  // Also update borrow book select
  const books = DBLib.getAllBooks();
  const bookSel = document.getElementById('borrow-book-select');
  if (bookSel) {
    bookSel.innerHTML = '<option value="">Select Book</option>';
    books.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id; opt.textContent = b.title;
      bookSel.appendChild(opt);
    });
  }
}

function renderCategoryList() {
  const cats = DBLib.getAllCategories();
  const list = document.getElementById('categories-list');
  if (!list) return;

  list.innerHTML = '';
  if (!cats.length) {
    list.innerHTML = '<li class="empty-item">No categories yet</li>';
    return;
  }

  cats.forEach(cat => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${esc(cat.name)}</span>
      <div class="cat-actions">
        <button class="btn-icon btn-edit" onclick="openEditCategoryModal(${cat.id}, '${esc(cat.name)}')">✏️</button>
        <button class="btn-icon btn-del" onclick="handleDeleteCategory(${cat.id})">🗑️</button>
      </div>`;
    list.appendChild(li);
  });
}

// ── Forms Setup ────────────────────────────────────────────────────────────

function setupForms() {
  // Borrow form
  document.getElementById('borrow-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const borrower  = v('borrower-name');
    const bookId    = v('borrow-book-select');
    const dateOut   = v('borrow-date-out');
    const dueDate   = v('borrow-due-date');

    if (!borrower || !bookId || !dateOut || !dueDate) {
      return showToast('Please fill all required fields', 'error');
    }
    try {
      await DBLib.recordBorrow({ bookId: parseInt(bookId), borrower, dateOut, dueDate });
      e.target.reset(); setDefaultDates();
      renderBooks();
      showToast('Borrow recorded ✓');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Return form — borrower change
  document.getElementById('return-borrower-select')?.addEventListener('change', handleBorrowerChange);

  // Return form submit
  document.getElementById('return-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const borrowSel  = document.getElementById('return-book-select');
    const borrowId   = borrowSel?.value;
    const bookId     = borrowSel?.options[borrowSel.selectedIndex]?.dataset?.bookId;
    const returnDate = v('return-date');
    const borrower   = v('return-borrower-select');

    if (!borrowId || !returnDate || !borrower) {
      return showToast('Please select a borrower, book, and return date', 'error');
    }
    try {
      await DBLib.recordReturn({ borrowId: parseInt(borrowId), bookId: parseInt(bookId), returnDate });
      e.target.reset(); setDefaultDates();
      renderReturnForm();
      renderBooks();
      showToast('Return recorded ✓');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Add book form
  document.getElementById('add-book-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const title    = v('add-book-title');
    const author   = v('add-author');
    const isbn     = v('add-isbn');
    const category = v('add-book-category');
    const copies   = parseInt(v('add-copies')) || 1;

    if (!title || !author || !category) {
      return showToast('Title, Author and Category are required', 'error');
    }
    try {
      const res = await DBLib.addBook({ title, author, isbn, category, copies });
      e.target.reset();
      document.getElementById('add-copies').value = 1;
      renderBooks();
      renderCategorySelects();
      showToast(res.merged ? `${copies} copies added to existing book ✓` : 'Book added ✓');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Add category form
  document.getElementById('add-category-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = v('add-category-name');
    if (!name) return showToast('Enter a category name', 'error');
    try {
      await DBLib.addCategory(name);
      e.target.reset();
      renderConfig();
      showToast('Category added ✓');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Edit book modal form
  document.getElementById('edit-book-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id       = parseInt(v('edit-book-id'));
    const title    = v('edit-book-title');
    const author   = v('edit-book-author');
    const category = v('edit-book-category');
    if (!title || !author || !category) {
      return showToast('All fields required', 'error');
    }
    try {
      await DBLib.updateBook(id, { title, author, category });
      closeModal('edit-book-modal');
      renderBooks();
      showToast('Book updated ✓');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Edit category modal form
  document.getElementById('edit-category-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id   = parseInt(v('edit-category-id'));
    const name = v('edit-category-name-input');
    if (!name) return showToast('Enter a name', 'error');
    try {
      await DBLib.updateCategory(id, name);
      closeModal('edit-category-modal');
      renderConfig();
      renderBooks();
      showToast('Category updated ✓');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ── Search ─────────────────────────────────────────────────────────────────

function setupSearch() {
  document.getElementById('search-books')?.addEventListener('input', function () {
    renderBooks(this.value.trim());
  });
  document.getElementById('search-history')?.addEventListener('input', function () {
    renderHistory(this.value.trim());
  });
}

// ── Modals ─────────────────────────────────────────────────────────────────

function setupModals() {
  // Close on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal(modal.id);
    });
  });
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('show');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('show');
}

function openEditBookModal(id) {
  const book = DBLib.getBook(id);
  if (!book) return showToast('Book not found', 'error');
  renderCategorySelects();
  document.getElementById('edit-book-id').value    = book.id;
  document.getElementById('edit-book-title').value  = book.title;
  document.getElementById('edit-book-author').value = book.author;
  setTimeout(() => {
    document.getElementById('edit-book-category').value = book.category;
  }, 50);
  openModal('edit-book-modal');
}

function openEditCategoryModal(id, name) {
  document.getElementById('edit-category-id').value         = id;
  document.getElementById('edit-category-name-input').value = name;
  openModal('edit-category-modal');
}

// ── Summary Modal ──────────────────────────────────────────────────────────

function openSummaryModal() {
  const stats = DBLib.getStats();

  document.getElementById('stat-titles').textContent  = stats.totalTitles;
  document.getElementById('stat-copies').textContent  = stats.totalCopies;
  document.getElementById('stat-active').textContent  = stats.activeLoans;
  document.getElementById('stat-returned').textContent= stats.returnedLoans;
  document.getElementById('stat-overdue').textContent = stats.overdueCount === 0 ? 'None' : `${stats.overdueCount} overdue`;

  const topList = document.getElementById('top-books-list');
  topList.innerHTML = '';
  if (!stats.topBooks.length) {
    topList.innerHTML = '<li>No borrowing records yet</li>';
  } else {
    stats.topBooks.forEach(b => {
      const li = document.createElement('li');
      li.textContent = `${b.title} — ${b.borrow_count}×`;
      topList.appendChild(li);
    });
  }

  const dueList = document.getElementById('due-today-list');
  dueList.innerHTML = '';
  if (!stats.dueToday.length) {
    dueList.innerHTML = '<li>None due today</li>';
  } else {
    stats.dueToday.forEach(r => {
      const li = document.createElement('li');
      li.textContent = `${r.title} — ${r.borrower}`;
      dueList.appendChild(li);
    });
  }

  openModal('summary-modal');
}

// ── Delete handlers ────────────────────────────────────────────────────────

async function handleDeleteBook(id) {
  if (!confirm('Delete all copies of this book? This cannot be undone.')) return;
  try {
    await DBLib.deleteBook(id);
    renderBooks();
    showToast('Book deleted');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleDeleteCategory(id) {
  if (!confirm('Delete this category? This cannot be undone.')) return;
  try {
    await DBLib.deleteCategory(id);
    renderConfig();
    showToast('Category deleted');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Backup / Restore ───────────────────────────────────────────────────────

function handleBackup() {
  DB.exportDB('gnoke-library-backup.db');
}

function handleChooseFile() {
  document.getElementById('restore-file')?.click();
}

function setupRestore() {
  document.getElementById('restore-file')?.addEventListener('change', async function (e) {
    if (!e.target.files.length) return;
    if (!confirm('Restoring will overwrite all current data. Continue?')) return;
    try {
      await DB.restoreDB(e.target.files[0]);
      loadPage('main-page');
      showToast('Data restored ✓');
    } catch (err) {
      showToast('Restore failed: ' + err.message, 'error');
    }
    this.value = '';
  });
}

// ── Reset demo data ────────────────────────────────────────────────────────

async function handleResetDemo() {
  if (!confirm('This will delete all demo data and start fresh. Continue?')) return;
  try {
    await DBLib.resetToFresh();
    document.getElementById('demo-banner').style.display = 'none';
    loadPage('main-page');
    showToast('Demo data cleared — you\'re ready to go ✓');
  } catch (err) {
    showToast('Reset failed: ' + err.message, 'error');
  }
}

// ── Utilities ──────────────────────────────────────────────────────────────

function v(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function setDefaultDates() {
  const today    = DB.today();
  const dueDate  = new Date(); dueDate.setDate(dueDate.getDate() + 14);
  const dueDateStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth()+1).padStart(2,'0')}-${String(dueDate.getDate()).padStart(2,'0')}`;

  const dateOut = document.getElementById('borrow-date-out');
  const due     = document.getElementById('borrow-due-date');
  const ret     = document.getElementById('return-date');

  if (dateOut) dateOut.value = today;
  if (due)     due.value     = dueDateStr;
  if (ret)     ret.value     = today;
}

// ── Toast ──────────────────────────────────────────────────────────────────

let _toastTimer;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Theme Toggle ───────────────────────────────────────────────────────────

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('gnoke_theme', next);
  document.getElementById('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
}

// Set correct icon on load
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('gnoke_theme');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
});

// ── About Page ─────────────────────────────────────────────────────────────

function renderAbout() {
  // Tech stack table
  const techTable = document.getElementById('about-tech-table');
  if (techTable) {
    const rows = [
      ['Engine',      'SQLite via sql.js (WebAssembly)'],
      ['Persistence', 'IndexedDB'],
      ['Offline',     'Service Worker PWA'],
      ['Frontend',    'HTML · CSS · Vanilla JS'],
      ['Typography',  'DM Sans · DM Mono · Playfair Display'],
      ['Version',     'v2.0'],
    ];
    techTable.innerHTML = rows.map(([label, val]) => `
      <tr>
        <td style="padding:7px 0;font-size:0.75rem;color:var(--muted);
                   font-family:var(--font-mono);width:40%;border-bottom:1px solid var(--border-color)">
          ${label}
        </td>
        <td style="padding:7px 0 7px 10px;font-size:0.82rem;
                   border-bottom:1px solid var(--border-color)">
          ${val}
        </td>
      </tr>`).join('');
  }

  // Live stats snapshot
  const statsTable = document.getElementById('about-stats-table');
  if (statsTable) {
    try {
      const s = DBLib.getStats();
      const rows = [
        ['Titles',       s.totalTitles],
        ['Total Copies', s.totalCopies],
        ['Active Loans', s.activeLoans],
        ['Returned',     s.returnedLoans],
        ['Overdue',      s.overdueCount],
      ];
      statsTable.innerHTML = rows.map(([label, val]) => `
        <tr>
          <td style="padding:7px 0;font-size:0.75rem;color:var(--muted);
                     font-family:var(--font-mono);width:50%;border-bottom:1px solid var(--border-color)">
            ${label}
          </td>
          <td style="padding:7px 0 7px 10px;font-size:0.88rem;font-weight:600;
                     border-bottom:1px solid var(--border-color)">
            ${val}
          </td>
        </tr>`).join('');
    } catch (e) {
      statsTable.innerHTML = '<tr><td colspan="2" style="color:var(--muted);font-size:0.8rem;padding:8px 0">Stats unavailable</td></tr>';
    }
  }
}

