// ─── AUTH ─────────────────────────────────────────────────────
async function checkAuth(requiredRole) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return null; }

  const { data: userData, error } = await db
    .from('users').select('role').eq('id', session.user.id).single();

  if (error || !userData) { await db.auth.signOut(); window.location.href = 'login.html'; return null; }

  if (userData.role !== requiredRole) {
    window.location.href = userData.role === 'trainer' ? 'trainer.html' : 'swimmer.html';
    return null;
  }
  return session.user;
}

async function logout() { await db.auth.signOut(); window.location.href = 'login.html'; }

// ─── FORMAT ──────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '–';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const h = Math.round((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')},${String(h).padStart(2, '0')}`;
}
function parseTime(str) {
  const match = str.trim().match(/^(\d+):(\d{2})[,.](\d{2})$/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 100;
}
function formatSlot(start, end) {
  if (!start) return '';
  const fmt = t => t ? t.substring(0, 5) : '';
  return ` (${fmt(start)}${end ? '–' + fmt(end) : ''})`;
}

// ─── UI HELPERS ──────────────────────────────────────────────
function showError(id, msg) { const el = document.getElementById(id); if (!el) return; el.textContent = msg; el.classList.add('visible'); }
function hideError(id) { const el = document.getElementById(id); if (!el) return; el.textContent = ''; el.classList.remove('visible'); }

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });
  const first = document.querySelector('.tab-btn');
  if (first) first.click();
}

function toggleDisc(header) {
  header.nextElementSibling.classList.toggle('open');
}

function confirmBtn(btn, success) {
  btn.textContent = success ? 'Gespeichert' : 'Fehler';
  btn.style.color = success ? 'var(--success)' : 'var(--danger)';
  setTimeout(() => { btn.textContent = 'Speichern'; btn.style.color = ''; }, 2500);
}
