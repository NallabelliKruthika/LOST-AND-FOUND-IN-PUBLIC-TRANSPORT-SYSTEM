
const $ = s => document.querySelector(s);

let token = localStorage.token || null;
let user = null;

try {
  user = JSON.parse(localStorage.user || 'null');
} catch {
  localStorage.removeItem('user');
}

const CATS = [
  'Bag', 'Phone', 'Wallet', 'Keys',
  'Documents', 'Electronics', 'Clothing', 'Other'
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

const fmt = d => {
  if (!d) return 'Date unavailable';
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString();
};

const opts = (arr, sel) =>
  arr.map(c => `<option value="${esc(c)}" ${c === sel ? 'selected' : ''}>${esc(c)}</option>`).join('');

async function api(url, method = 'GET', body) {
  const o = { method, headers: {} };

  if (token) {
    o.headers.Authorization = 'Bearer ' + token;
  }

  if (body instanceof FormData) {
    o.body = body;
  } else if (body) {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(body);
  }

  const r = await fetch('/api' + url, o);
  const d = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(d.error || 'Something went wrong');
  }

  return d;
}

function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.hidden = false;

  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 3000);
}

const safe = fn => async (...args) => {
  try {
    await fn(...args);
  } catch (e) {
    toast(e.message);
  }
};

// ---------- Report card ----------

function card(r, actions = '') {
  if (!r) {
    return '<div class="card muted">Report deleted</div>';
  }

  const done = ['Claimed', 'Returned'].includes(r.status);

  return `
    <article class="card report-card">
      ${r.imagePath
        ? `<img class="report-image" src="${esc(r.imagePath)}" alt="${esc(r.category)}">`
        : `<div class="report-placeholder">📦</div>`}

      <div class="report-card-content">
        <div class="tag-row">
          <span class="tag ${r.type.toLowerCase()}">${esc(r.type)}</span>
          <span class="tag ${done ? 'claimed' : 'other'}">${esc(r.status)}</span>
        </div>

        <h3>${esc(r.category)}</h3>
        <p>${esc(r.description)}</p>

        <div class="report-meta">
          <span>📍 ${esc(r.location)}</span>
          <span>📅 ${fmt(r.date)}</span>
          ${r.user?.name ? `<span>👤 ${esc(r.user.name)}</span>` : ''}
        </div>

        ${actions ? `<div class="card-actions">${actions}</div>` : ''}
      </div>
    </article>
  `;
}

// ---------- Navigation ----------

const TABS = {
  home: 'Home',
  lost: 'Report Lost',
  found: 'Report Found',
  dash: 'My Dashboard',
  admin: 'Admin'
};

function nav(active) {
  if (!user) {
    $('#nav').innerHTML = '';
    return;
  }

  const keys = Object.keys(TABS).filter(
    k => k !== 'admin' || user.role === 'admin'
  );

  $('#nav').innerHTML =
    keys.map(k => `
      <button class="${k === active ? 'on' : ''}" onclick="go('${k}')">
        ${TABS[k]}
      </button>
    `).join('') +
    `<button class="logout-btn" onclick="logout()">Logout (${esc(user.name)})</button>`;
}

function go(t) {
  const views = {
    home,
    lost: () => form('Lost'),
    found: () => form('Found'),
    dash,
    admin
  };

  if (!views[t] || (t === 'admin' && user?.role !== 'admin')) {
    t = 'home';
  }

  nav(t);
  safe(views[t])();
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');

  token = null;
  user = null;

  start();
}

// ---------- Login and Register ----------

function authView() {
  nav();

  $('#view').innerHTML = `
    <section class="auth-welcome">
      <div class="auth-welcome-content">
        <span class="eyebrow">PUBLIC TRANSPORT LOST & FOUND PORTAL</span>
        <h2>Lost something during your journey?</h2>
        <p>
          Don't worry. Report lost belongings, find reported items,
          and reconnect with what matters.
        </p>
        <div class="welcome-points">
          <span>✓ Easy reporting</span>
          <span>✓ Smart item matching</span>
          <span>✓ Claim tracking</span>
        </div>
      </div>
      <div class="auth-illustration">🚌</div>
    </section>

    <section class="auth-grid">
      <div class="box auth-card login-card">
        <div class="auth-icon">🔐</div>
        <h2>Welcome Back!</h2>
        <p class="muted">Login to access your account.</p>

        <form id="lf">
          <label>Email Address</label>
          <input name="email" type="email" placeholder="Enter your email" required>

          <label>Password</label>
          <input name="password" type="password" placeholder="Enter your password" required>

          <button class="primary" type="submit">Login to Account →</button>
        </form>
      </div>

      <div class="box auth-card register-card">
        <div class="auth-icon">✨</div>
        <h2>Create Account</h2>
        <p class="muted">Join the community and help reunite lost items.</p>

        <form id="rf">
          <label>Full Name</label>
          <input name="name" placeholder="Enter your full name" required>

          <label>Email Address</label>
          <input name="email" type="email" placeholder="Enter your email" required>

          <label>Phone Number</label>
          <input name="phone" type="tel" placeholder="Enter your phone number">

          <label>Password</label>
          <input name="password" type="password" placeholder="Create a password" required>

          <button class="primary" type="submit">Create My Account →</button>
        </form>
      </div>
    </section>
  `;

  const submit = (id, url) => {
    $(id).onsubmit = safe(async e => {
      e.preventDefault();

      const button = e.target.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Please wait...';

      try {
        const d = await api(
          url,
          'POST',
          Object.fromEntries(new FormData(e.target))
        );

        token = d.token;
        user = d.user;

        localStorage.token = token;
        localStorage.user = JSON.stringify(user);

        toast('Welcome, ' + user.name + '!');
        start();
      } finally {
        if (!token) {
          button.disabled = false;
          button.textContent = id === '#lf'
            ? 'Login to Account →'
            : 'Create My Account →';
        }
      }
    });
  };

  submit('#lf', '/auth/login');
  submit('#rf', '/auth/register');
}

// ---------- Home and Search ----------

async function home() {
  $('#view').innerHTML = `
    <section class="hero-section">
      <div class="hero-content">
        <span class="eyebrow">TRANSIT LOST & FOUND</span>
        <h2>Every lost item deserves a way back home.</h2>
        <p>
          Search reported belongings or submit a report.
          Let's make every journey a little safer.
        </p>

        <div class="hero-actions">
          <button class="hero-button" onclick="go('lost')">Report a Lost Item</button>
          <button class="hero-button secondary" onclick="go('found')">Report a Found Item</button>
        </div>
      </div>

      <div class="hero-art">
        <div class="hero-circle">🚌</div>
        <span class="floating-item item-one">🎒</span>
        <span class="floating-item item-two">📱</span>
        <span class="floating-item item-three">🔑</span>
      </div>
    </section>

    <section class="search-section">
      <div class="section-heading">
        <span class="eyebrow">FIND YOUR BELONGINGS</span>
        <h2>Search Lost & Found Items</h2>
        <p>Use the filters below to find a matching report.</p>
      </div>

      <div class="box search-box">
        <div class="filters">
          <input id="q" placeholder="🔎 Search keywords">

          <select id="ty">
            <option value="">Lost + Found</option>
            <option>Lost</option>
            <option>Found</option>
          </select>

          <select id="ct">
            <option value="">All categories</option>
            ${opts(CATS)}
          </select>

          <input id="lo" placeholder="📍 Location">
          <input id="fr" type="date" title="From date">
          <input id="to" type="date" title="To date">

          <button class="primary search-button" id="searchBtn">Search Items →</button>
        </div>
      </div>
    </section>

    <section class="results-section">
      <div class="results-heading">
        <div>
          <span class="eyebrow">COMMUNITY REPORTS</span>
          <h2>Recently Reported Items</h2>
        </div>
        <span class="results-label">Latest available reports</span>
      </div>

      <div class="grid" id="res">
        <p class="muted">Loading reports...</p>
      </div>
    </section>
  `;

  const run = safe(async () => {
    const button = $('#searchBtn');
    button.disabled = true;
    button.textContent = 'Searching...';

    try {
      const p = new URLSearchParams({
        query: $('#q').value,
        type: $('#ty').value,
        category: $('#ct').value,
        location: $('#lo').value,
        from: $('#fr').value,
        to: $('#to').value
      });

      [...p.keys()].forEach(k => {
        if (!p.get(k)) p.delete(k);
      });

      const list = await api('/reports/search?' + p);

      $('#res').innerHTML = list.map(r => card(r)).join('') ||
        `<div class="empty-state">
          <div>🔍</div>
          <h3>No reports found</h3>
          <p>Try changing your search keywords or filters.</p>
        </div>`;
    } finally {
      button.disabled = false;
      button.textContent = 'Search Items →';
    }
  });

  $('#searchBtn').onclick = run;

  $('#q').addEventListener('keydown', e => {
    if (e.key === 'Enter') run();
  });

  await run();
}

// ---------- Report Form ----------

function form(type) {
  $('#view').innerHTML = `
    <section class="form-page">
      <div class="form-intro">
        <span class="eyebrow">HELP OUR COMMUNITY</span>
        <h2>Report a ${type} Item</h2>
        <p>
          ${type === 'Lost'
            ? 'Tell us about the item you lost so someone can help you find it.'
            : 'Found something during your journey? Share the details to help its owner.'}
        </p>
      </div>

      <div class="box report-form-box">
        <div class="form-icon">${type === 'Lost' ? '🔎' : '🎒'}</div>

        <form id="reportForm">
          <label>Item Category</label>
          <select name="category" required>${opts(CATS)}</select>

          <label>Item Description</label>
          <textarea name="description"
            placeholder="Describe the item, including colour, brand, unique marks..."
            required></textarea>

          <label>Location</label>
          <input name="location"
            placeholder="Example: City Bus Depot, Route 5"
            required>

          <label>Date</label>
          <input name="date" type="date"
            max="${new Date().toISOString().slice(0, 10)}"
            required>

          <label>Upload Item Image (Optional)</label>
          <input name="image" type="file" accept="image/*">

          <div class="form-actions">
            <button class="primary" type="submit">Submit ${type} Report →</button>
            <button class="btn grey" type="button" onclick="go('home')">Cancel</button>
          </div>
        </form>
      </div>
    </section>
  `;

  $('#reportForm').onsubmit = safe(async e => {
    e.preventDefault();

    const button = e.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Submitting...';

    try {
      const d = await api(
        '/reports/' + type.toLowerCase(),
        'POST',
        new FormData(e.target)
      );

      toast(d.matches
        ? `Submitted! ${d.matches} possible match(es) found.`
        : 'Report submitted successfully.');

      go('dash');
    } finally {
      button.disabled = false;
      button.textContent = `Submit ${type} Report →`;
    }
  });
}

// ---------- User Dashboard ----------

async function dash() {
  const [mine, claims, notes] = await Promise.all([
    api('/reports/mine'),
    api('/claims'),
    api('/notifications')
  ]);

  const lostCount = mine.filter(r => r.type === 'Lost').length;
  const foundCount = mine.filter(r => r.type === 'Found').length;
  const activeCount = mine.filter(
    r => !['Claimed', 'Returned'].includes(r.status)
  ).length;

  $('#view').innerHTML = `
    <section class="dashboard-heading">
      <div>
        <span class="eyebrow">PERSONAL DASHBOARD</span>
        <h2>Hello, ${esc(user.name)}! 👋</h2>
        <p>Manage your reports, claims and notifications in one place.</p>
      </div>

      <button class="primary" onclick="go('lost')">+ New Report</button>
    </section>

    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">📋</div>
        <div><span>Total Reports</span><strong>${mine.length}</strong></div>
      </div>

      <div class="stat-card">
        <div class="stat-icon red">🔍</div>
        <div><span>Lost Items</span><strong>${lostCount}</strong></div>
      </div>

      <div class="stat-card">
        <div class="stat-icon green">🎒</div>
        <div><span>Found Items</span><strong>${foundCount}</strong></div>
      </div>

      <div class="stat-card">
        <div class="stat-icon orange">⏳</div>
        <div><span>Active Reports</span><strong>${activeCount}</strong></div>
      </div>
    </section>

    <section class="box dashboard-panel">
      <div class="panel-heading">
        <h3>🔔 Notifications</h3>
        <span class="panel-count">${notes.length}</span>
      </div>

      ${notes.map(n => `
        <div class="note ${n.readStatus ? '' : 'new'}">
          <div>${esc(n.message)}</div>
          <span class="muted">${fmt(n.createdAt)}</span>
        </div>
      `).join('') || '<p class="muted">No notifications yet.</p>'}
    </section>

    <section class="box dashboard-panel">
      <div class="panel-heading">
        <h3>📌 Claim Status</h3>
        <span class="panel-count">${claims.length}</span>
      </div>

      ${claims.map(c => `
        <div class="claim-row">
          <div>
            <strong>${esc(c.reportLost?.category || 'Lost item')}</strong>
            <p class="muted">
              Lost at ${esc(c.reportLost?.location || 'Unknown')}
              ↔ Found at ${esc(c.reportFound?.location || 'Unknown')}
            </p>
          </div>
          <span class="status-pill">${esc(c.claimStatus)}</span>
        </div>
      `).join('') || '<p class="muted">No claims submitted yet.</p>'}
    </section>

    <section class="my-reports-section">
      <div class="results-heading">
        <div>
          <span class="eyebrow">YOUR ACTIVITY</span>
          <h2>My Reports</h2>
        </div>
        <button class="btn" onclick="go('lost')">+ Add Report</button>
      </div>

      <div class="grid">
        ${mine.map(r => card(r, `
          <button type="button" class="btn green" onclick="window.matches('${r._id}')">View Matches</button>
          <button class="btn grey" onclick="edit('${r._id}')">Edit</button>
          <button class="btn red" onclick="del('${r._id}','dash')">Delete</button>
        `)).join('') || `
          <div class="empty-state">
            <div>📦</div>
            <h3>No reports yet</h3>
            <p>Your submitted lost and found reports will appear here.</p>
            <button class="primary" onclick="go('lost')">Create Your First Report</button>
          </div>
        `}
      </div>

      <div id="mm"></div>
    </section>
  `;

  if (notes.some(n => !n.readStatus)) {
    api('/notifications/read', 'PUT').catch(() => {});
  }
}

// ---------- Matching and Claims ----------

window.matches = safe(async id => {
  const ms = await api('/reports/matches/' + id);

  $('#mm').innerHTML = `
    <section class="box matches-panel">
      <span class="eyebrow">SMART MATCHING</span>
      <h2>Possible Matches</h2>
      <div class="grid">
        ${ms.map(m => card(m.report, `
          <div class="match-score">Match score: ${m.score}%</div>
          <button class="btn green" onclick="claim('${id}','${m.report._id}')">
            This is my item / Claim
          </button>
        `)).join('') || '<p class="muted">No possible matches found yet.</p>'}
      </div>
    </section>
  `;

  $('#mm').scrollIntoView({ behavior: 'smooth' });
});

window.claim = safe(async (a, b) => {
  await api('/claims', 'POST', {
    myReportId: a,
    otherReportId: b
  });

  toast('Claim submitted for admin verification.');
  await dash();
});

window.edit = safe(async id => {
  const description = prompt('Enter the new description:');

  if (!description) return;

  const location = prompt('New location (leave blank to keep current):');

  await api('/reports/' + id, 'PUT', {
    description,
    location
  });

  toast('Report updated successfully.');
  await dash();
});

window.del = safe(async (id, back) => {
  if (confirm('Are you sure you want to delete this report?')) {
    await api('/reports/' + id, 'DELETE');
    toast('Report deleted.');
    go(back);
  }
});

// ---------- Admin Dashboard ----------

async function admin() {
  const [reports, claims, stats] = await Promise.all([
    api('/reports'),
    api('/claims'),
    api('/admin/stats')
  ]);

  const pending = claims.filter(c => c.claimStatus === 'Pending');

  $('#view').innerHTML = `
    <section class="dashboard-heading">
      <div>
        <span class="eyebrow">ADMIN CONTROL CENTER</span>
        <h2>Administration Dashboard</h2>
        <p>Monitor reports, review claims and manage item statuses.</p>
      </div>
    </section>

    <section class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon blue">📋</div>
        <div><span>Total Reports</span><strong>${reports.length}</strong></div>
      </div>

      <div class="stat-card">
        <div class="stat-icon orange">⏳</div>
        <div><span>Pending Claims</span><strong>${pending.length}</strong></div>
      </div>

      <div class="stat-card">
        <div class="stat-icon green">✅</div>
        <div><span>Total Claims</span><strong>${claims.length}</strong></div>
      </div>
    </section>

    <section class="admin-summary-grid">
      <div class="box">
        <h3>📊 Most Common Items</h3>
        ${stats.categories.map(c => `
          <div class="summary-row">
            <span>${esc(c._id)}</span>
            <strong>${c.count}</strong>
          </div>
        `).join('') || '<p class="muted">No data available.</p>'}
      </div>

      <div class="box">
        <h3>📌 Status Summary</h3>
        ${stats.statuses.map(c => `
          <div class="summary-row">
            <span>${esc(c._id)}</span>
            <strong>${c.count}</strong>
          </div>
        `).join('') || '<p class="muted">No data available.</p>'}
      </div>
    </section>

    <section class="box dashboard-panel">
      <div class="panel-heading">
        <h3>Pending Claims (${pending.length})</h3>
      </div>

      ${pending.map(c => `
        <div class="admin-claim">
          <div class="admin-claim-reports">
            ${card(c.reportLost)}
            ${card(c.reportFound)}
          </div>

          <p class="muted">
            Claimed by ${esc(c.user?.name)}
            · ${esc(c.user?.email)}
            · ${esc(c.user?.phone || '')}
          </p>

          <button class="btn green" onclick="decide('${c._id}','approve')">Approve Claim</button>
          <button class="btn red" onclick="decide('${c._id}','reject')">Reject Claim</button>
        </div>
      `).join('') || '<p class="muted">No pending claims.</p>'}
    </section>

    <section class="admin-reports">
      <div class="results-heading">
        <div>
          <span class="eyebrow">SYSTEM RECORDS</span>
          <h2>All Reports</h2>
        </div>
      </div>

      <div class="grid">
        ${reports.map(r => card(r, `
          <label class="muted">Update status</label>
          <select onchange="setStatus('${r._id}',this.value)">
            ${opts(['Pending', 'Claimed', 'Unclaimed', 'Returned'], r.status)}
            ${r.status === 'Matched' ? '<option selected disabled>Matched</option>' : ''}
          </select>
          <button class="btn red" onclick="del('${r._id}','admin')">Delete Report</button>
        `)).join('') || '<p class="muted">No reports available.</p>'}
      </div>
    </section>
  `;
}

window.decide = safe(async (id, action) => {
  await api(`/claims/${id}/${action}`, 'PUT');

  toast('Claim ' + (action === 'approve' ? 'approved' : 'rejected') + '.');
  await admin();
});

window.setStatus = safe(async (id, status) => {
  await api(`/reports/${id}/status`, 'PUT', { status });

  toast('Report status updated.');
  await admin();
});

// ---------- Start ----------

function start() {
  if (!token || !user) {
    authView();
    return;
  }

  go(user.role === 'admin' ? 'admin' : 'home');
}

start();
