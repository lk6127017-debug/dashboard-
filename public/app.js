/* ========================================
   Dashboard — App Logic
   ======================================== */

(function () {
  'use strict';

  /* ----------------------------------------
     DEFAULT STATE
     ---------------------------------------- */
  const DEFAULT_STATE = {
    tasks: [],
    finances: {
      categories: [],
      transactions: [],
      chartMonths: [],
      chartValues: []
    },
    objectives: {
      week: [],
      month: [],
      year: []
    },
    settings: {
      accent: '#6b8afd',
      compact: false,
      tab: 'planning',
      streak: 0,
      lastDay: new Date().getDate(),
      historiqueTaches: []
    },
    notes: []
  };

  /* ----------------------------------------
     STATE MANAGEMENT
     ---------------------------------------- */
  let state = null;
  let saveTimeout = null;

  function loadState() {
    try {
      const raw = localStorage.getItem('dashboard');
      if (raw) {
        state = JSON.parse(raw);
        // Merge missing keys from defaults
        state.tasks = state.tasks || DEFAULT_STATE.tasks;
        // Migrate tasks: add timer fields if missing
        state.tasks = (Array.isArray(state.tasks) ? state.tasks : []).map(t => {
          return Object.assign({ target: 0, elapsed: 0, running: false, startedAt: 0, alerted: false }, t || {});
        });
        state.finances = { ...DEFAULT_STATE.finances, ...state.finances };
        state.finances.categories = state.finances.categories || DEFAULT_STATE.finances.categories;
        state.finances.transactions = state.finances.transactions || DEFAULT_STATE.finances.transactions;
        state.objectives = { ...DEFAULT_STATE.objectives, ...state.objectives };
        state.notes = state.notes || DEFAULT_STATE.notes;
        // Sanitize every note: any corrupt field is fixed so rendering never throws
        state.notes = (Array.isArray(state.notes) ? state.notes : []).map(n => {
          const nn = {};
          nn.id = (n && typeof n.id === 'string' && n.id) ? n.id : 'n' + Math.random().toString(36).slice(2, 8);
          nn.title = (n && typeof n.title === 'string') ? n.title : '';
          nn.body = (n && typeof n.body === 'string') ? n.body : '';
          nn.updated = (n && typeof n.updated === 'number' && isFinite(n.updated)) ? n.updated : Date.now();
          nn.history = Array.isArray(n.history) ? n.history.map(v => ({
            title: (v && typeof v.title === 'string') ? v.title : '',
            body: (v && typeof v.body === 'string') ? v.body : '',
            ts: (v && typeof v.ts === 'number' && isFinite(v.ts)) ? v.ts : Date.now()
          })) : [];
          return nn;
        });
        // Migrate older objectives format (separate list/rings keys)
        if (state.objectives.rings) {
          state.objectives.week = migrateObjectives(state.objectives.week || DEFAULT_STATE.objectives.week, state.objectives.rings.week, 'w');
          state.objectives.month = migrateObjectives(state.objectives.month || DEFAULT_STATE.objectives.month, state.objectives.rings.month, 'm');
          state.objectives.year = migrateObjectives(state.objectives.year || DEFAULT_STATE.objectives.year, state.objectives.rings.year, 'y');
          delete state.objectives.rings;
        }
        state.settings = { ...DEFAULT_STATE.settings, ...state.settings };
      } else {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      }
    } catch (e) {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  function saveState() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      try { localStorage.setItem('dashboard', JSON.stringify(state)); } catch (e) { /* ignore */ }
    }, 500);
  }

  function migrateObjectives(list, rings, prefix) {
    const items = (list || []).map(o => ({
      id: prefix + 'l' + (typeof o.id === 'string' ? o.id : Math.random().toString(36).slice(2, 7)),
      type: 'list', name: o.name, val: o.val, color: o.color
    }));
    (rings || []).forEach(r => {
      items.unshift({
        id: prefix + (typeof r.id === 'string' ? r.id : Math.random().toString(36).slice(2, 7)),
        type: 'ring', label: r.label, pct: r.pct, sub: r.sub, color: r.color
      });
    });
    return items;
  }

  function checkDayReset() {
    const today = new Date().getDate();
    if (state.settings.lastDay !== today) {
      // Vérifier si le jour précédent toutes les tâches étaient terminées
      const allDonePrevDay = state.tasks.length > 0 ? state.tasks.every(t => t.done) : false;
      // Mettre à jour le streak
      if (allDonePrevDay) {
        state.settings.streak = (state.settings.streak || 0) + 1;
      } else {
        state.settings.streak = Math.max(0, (state.settings.streak || 0) - 1);
      }
      // Sauvegarder les tâches non terminées dans l'historique
      const nonDone = state.tasks.filter(t => !t.done);
      nonDone.forEach(t => {
        state.settings.historiqueTaches = state.settings.historiqueTaches || [];
        if (!state.settings.historiqueTaches.find(ht => ht.id === t.id)) {
          state.settings.historiqueTaches.push({ ...t, savedAt: Date.now() });
        }
      });
      // Supprimer toutes les tâches du jour précédent (réinitialisation)
      state.tasks = state.tasks.filter(t => t.done); // garder seulement celles terminées ? Non, l'utilisateur a dit supprimer
      state.tasks = []; // réinitialisation complète
      state.settings.lastDay = today;
      saveState();
      renderStreak();
    }
  }

  function renderStreak() {
    const el = document.getElementById('streak-count');
    if (el) el.textContent = (state.settings.streak || 0);
  }

  function updateStreak() {
    const prevStreak = state.settings.streak || 0;
    const allDone = state.tasks.length > 0 ? state.tasks.every(t => t.done) : false;
    if (allDone) {
      state.settings.streak = prevStreak + 1;
    } else {
      if (state.tasks.length > 0 && !state.tasks.some(t => t.done)) {
        state.settings.streak = Math.max(0, prevStreak - 1);
      }
    }
    const newStreak = state.settings.streak || 0;
    renderStreak();
    saveState();
    if (newStreak > prevStreak) {
      const streakEl = document.getElementById('streak-flame');
      if (streakEl) {
        streakEl.classList.add('flame-active');
      }
    }
  }

  /* ----------------------------------------
     SVG TEMPLATES
     ---------------------------------------- */
  const starSVG = '<svg viewBox="0 0 24 24" fill="none" width="12" height="12"><path d="M12 2l2.5 6.5L21 9.5l-5.5 4.5L17.5 21 12 17.5 6.5 21 8.5 14 3 9.5l6.5-1L12 2z" fill="currentColor"/></svg>';
  const checkSVG = '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M17.136 8.564a1 1 0 010 1.414l-7.348 7.348a1 1 0 01-1.414 0L4.732 13.273a1 1 0 011.414-1.414l3.006 3.006 6.641-6.641a1 1 0 011.414 0z" fill="currentColor"/></svg>';
  const emptySVG = '<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>';
  const dragSVG = '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><circle cx="8" cy="6" r="1.5" fill="currentColor"/><circle cx="16" cy="6" r="1.5" fill="currentColor"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/><circle cx="16" cy="12" r="1.5" fill="currentColor"/><circle cx="8" cy="18" r="1.5" fill="currentColor"/><circle cx="16" cy="18" r="1.5" fill="currentColor"/></svg>';
  const delSVG = '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
  const editSVG = '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
  const warnSVG = '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
  const arrowUpSVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.386 2.361a1 1 0 011.27 0l6.539 5.54a1 1 0 01-1.27 1.54l-5.02-4.257V21a1 1 0 11-2 0V5.184l-5.02 4.257a1 1 0 01-1.27-1.54l6.539-5.54z" fill="currentColor"/></svg>';
  const arrowDownSVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.386 21.639a1 1 0 001.27 0l6.539-5.54a1 1 0 00-1.27-1.54l-5.02 4.257V3a1 1 0 10-2 0v15.816l-5.02-4.257a1 1 0 00-1.27 1.54l6.539 5.54z" fill="currentColor"/></svg>';

  /* ----------------------------------------
     ACCENT COLORS
     ---------------------------------------- */
  const ACCENT_COLORS = [
    { name: 'Bleu', value: '#6b8afd' },
    { name: 'Violet', value: '#c084fc' },
    { name: 'Vert', value: '#3ddc84' },
    { name: 'Orange', value: '#f59e0b' },
    { name: 'Rose', value: '#f472b6' },
    { name: 'Cyan', value: '#22d3ee' }
  ];

  function setAccent(hex) {
    state.settings.accent = hex;
    document.documentElement.style.setProperty('--accent', hex);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r},${g},${b}`);
    document.querySelectorAll('.db-accent-dot').forEach(d => {
      d.classList.toggle('active', d.dataset.color === hex);
    });
    saveState();
  }

  /* ----------------------------------------
     TABS
     ---------------------------------------- */
  function switchTab(name) {
    state.settings.tab = name;
    document.querySelectorAll('.db-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.db-panel').forEach(p => {
      const isActive = p.id === 'panel-' + name;
      p.classList.toggle('active', isActive);
    });
    if (name === 'objectifs') renderObjectives();
    if (name === 'finances') { renderDonut(); animateChart(); }
    if (name === 'planning') updatePlanGridOrder();
    saveState();
  }

  /* ----------------------------------------
     TASK ICONS
     ---------------------------------------- */
  const TASK_ICONS = {
    '': '',
    bath:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/><path d="M3 10h18v3a5 5 0 01-5 5H8a5 5 0 01-5-5v-3z"/><path d="M5 10V7a2 2 0 012-2"/><path d="M6 18l-1 3M18 18l1 3"/></svg>',
    sport:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="M4 22l4-10 4 2 4-3 4 2"/><path d="M9 18l3-3 3 3"/></svg>',
    food:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h2v11"/><path d="M7 2v7"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>',
    work:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>',
    study:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
    sleep:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>',
    meditate:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6" r="3"/><path d="M12 9v3"/><path d="M5 20c0-3 3-5 7-5s7 2 7 5"/><path d="M3 20h18"/></svg>',
    call:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.37 1.9.72 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0122 16.92z"/></svg>',
    email:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>',
    meeting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    shop:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h2l2 13h12l2-9H6"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>',
    clean:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2L6 14h4l-2 8 8-12h-4l2-8z"/></svg>',
    cook:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h18v9H3z"/><path d="M6 11V7a2 2 0 012-2h8a2 2 0 012 2v4"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></svg>',
    music:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    game:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 11h4M8 9v4"/><circle cx="15" cy="12" r="1"/><circle cx="18" cy="10" r="1"/><path d="M17 7H7a5 5 0 00-5 5v0a5 5 0 005 5h10a5 5 0 005-5v0a5 5 0 00-5-5z"/></svg>',
    movie:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 7h5M2 12h5M2 17h5M17 7h5M17 12h5M17 17h5"/></svg>',
    walk:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="M7 22l3-8 3 2 3-4 4 6"/></svg>',
    car:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14l-1.5-5h-11L5 17z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><path d="M3 17v-3l2-5h14l2 5v3"/></svg>',
    doctor:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="10"/></svg>',
    pill:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="9" width="20" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/></svg>',
    money:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a1.5 1.5 0 010 3H10a1.5 1.5 0 000 3h5"/></svg>',
    idea:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0012 2z"/></svg>',
    star:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>'
  };

  function iconFor(t) { return (t && t.icon && TASK_ICONS[t.icon]) || ''; }

  /* ----------------------------------------
     PLANNING — TASKS
     ---------------------------------------- */
  function renderTasks() {
    ['matin', 'apres', 'soir'].forEach(col => {
      const container = document.getElementById('col-' + col);
      container.innerHTML = '';
      tasksForCol(col).forEach((t, i) => {
        const el = document.createElement('div');
        el.className = 'task-row';
        el.draggable = true;
        el.dataset.id = t.id;
        el.tabIndex = 0;
        el.setAttribute('role', 'listitem');
        el.setAttribute('aria-label', `${t.title}, priorité ${t.prio}${t.done ? ', terminé' : ''}`);

        const stars = Array(t.prio).fill(starSVG).join('');
        const elapsed = liveElapsed(t);
        const isOver = t.target > 0 && elapsed >= t.target;
        if (isOver) el.classList.add('timer-done');
        else if (t.running) el.classList.add('timer-running');

        const targetLabel = t.target > 0 ? '🎯 ' + formatDuration(t.target) : '🎯 définir';
        const barPct = t.target > 0 ? Math.min(100, (elapsed / t.target) * 100) : 0;
        const iconHTML = iconFor(t) ? '<span class="task-icon">' + iconFor(t) + '</span>' : '';

        el.innerHTML =
          '<div class="task-drag" aria-hidden="true">' + dragSVG + '</div>' +
          '<div class="task-check ' + (t.done ? 'checked' : '') + '" role="checkbox" aria-checked="' + t.done + '" tabindex="0">' +
            (t.done ? checkSVG : emptySVG) +
          '</div>' +
          '<div class="task-text ' + (t.done ? 'done' : '') + '">' + iconHTML + '<span class="task-title-text">' + escHtml(t.title) + '</span></div>' +
          '<div class="task-stars" aria-hidden="true">' + stars + '</div>' +
          '<div class="task-actions">' +
            '<button class="edit-icon-btn" aria-label="Changer l\'icône" title="Changer l\'icône">' +
              '<svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            '</button>' +
            '<button class="del-btn" aria-label="Supprimer">' + delSVG + '</button>' +
          '</div>' +
          '<div class="task-timer" role="group" aria-label="Chronomètre">' +
            '<button class="task-timer-btn ' + (t.running ? 'running' : '') + '" data-action="toggle" aria-label="' + (t.running ? 'Mettre en pause' : 'Démarrer') + '">' +
              (t.running
                ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg><span>Pause</span>'
                : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><span>Démarrer</span>') +
            '</button>' +
            '<div class="task-timer-display ' + (isOver ? 'over' : '') + '">' + formatDuration(elapsed) + '</div>' +
            (t.target > 0 ? '<div class="task-timer-bar"><div class="task-timer-bar-fill ' + (isOver ? 'over' : '') + '" style="width:' + barPct + '%"></div></div>' : '') +
            '<div class="task-timer-target">' + targetLabel + ' <button data-action="target" aria-label="Modifier la cible">✎</button></div>' +
          '</div>';

        // Events
        el.addEventListener('dragstart', onDragStart);
        el.addEventListener('dragend', onDragEnd);
        el.querySelector('.task-check').addEventListener('click', () => toggleTask(t.id));
        el.querySelector('.task-check').addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTask(t.id); }
        });
        el.querySelector('.del-btn').addEventListener('click', () => removeTask(t.id));
        el.addEventListener('keydown', e => {
          if (e.key === 'Delete') removeTask(t.id);
        });

        // Timer events
        el.querySelector('[data-action="toggle"]').addEventListener('click', e => {
          e.stopPropagation();
          if (t.running) stopTimer(t.id); else startTimer(t.id);
        });
        el.querySelector('[data-action="target"]').addEventListener('click', e => {
          e.stopPropagation();
          promptTarget(t.id);
        });
        el.querySelector('.edit-icon-btn').addEventListener('click', e => {
          e.stopPropagation();
          promptIcon(t.id);
        });

        container.appendChild(el);

        // Staggered appearance animation
        requestAnimationFrame(() => {
          setTimeout(() => el.classList.add('visible'), i * 40);
        });
      });
    });

    // Update column titles with counts
    ['matin', 'apres', 'soir'].forEach(col => {
      const colEl = document.querySelector('.plan-col[data-col="' + col + '"] .plan-col-title');
      if (!colEl) return;
      // Remove old count
      const oldCount = colEl.querySelector('.plan-col-count');
      if (oldCount) oldCount.remove();
      const colTasks = tasksForCol(col);
      const colDone = colTasks.filter(t => t.done).length;
      const countEl = document.createElement('span');
      countEl.className = 'plan-col-count';
      countEl.textContent = colDone + ' / ' + colTasks.length;
      colEl.appendChild(countEl);
    });

    const done = state.tasks.filter(t => t.done).length;
    document.getElementById('plan-remaining').textContent = state.tasks.length - done;
    document.getElementById('plan-done').textContent = done;
    document.getElementById('plan-total').textContent = state.tasks.length;

    updateStreak();

    if (state.tasks.some(t => t.running)) ensureTimerLoop();
  }

  function tasksForCol(col) {
    let result = state.tasks.filter(t => t.col === col);
    const prioFilter = document.getElementById('plan-filter-prio');
    const iconFilter = document.getElementById('plan-filter-icon');
    if (prioFilter && prioFilter.value) {
      result = result.filter(t => String(t.prio) === prioFilter.value);
    }
    if (iconFilter && iconFilter.value) {
      result = result.filter(t => t.icon === iconFilter.value);
    }
    return result;
  }

  function toggleTask(id) {
    const t = state.tasks.find(x => x.id === id);
    if (t) {
      t.done = !t.done;
      if (t.done) {
        // Animation fluide et suppression après 2 secondes
        const rowEl = document.querySelector('.task-row[data-id="' + id + '"]');
        if (rowEl) {
          rowEl.style.animation = 'fadeOut 0.6s ease-out forwards';
          rowEl.style.animationDelay = '1.2s';
        }
        setTimeout(() => {
          state.tasks = state.tasks.filter(x => x.id !== id);
          renderTasks();
          updateStreak();
          saveState();
        }, 2000);
      }
      renderTasks(); updateStreak(); saveState();
    }
  }

  function removeTask(id) {
    if (!confirm('Supprimer cette tâche ?')) return;
    state.tasks = state.tasks.filter(x => x.id !== id);
    renderTasks(); saveState();
  }

  /* --- Drag & Drop (fixed) --- */
  let draggedId = null;

  function onDragStart(e) {
    const row = e.target.closest('.task-row');
    if (!row) return;
    draggedId = row.dataset.id;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd(e) {
    const row = e.target.closest('.task-row');
    if (row) row.classList.remove('dragging');
    document.querySelectorAll('.task-row.drag-over').forEach(el => el.classList.remove('drag-over'));
    draggedId = null;
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.task-row');
    if (row && row.dataset.id !== draggedId) row.classList.add('drag-over');
  }

  function onDragLeave(e) {
    const row = e.target.closest('.task-row');
    if (row) row.classList.remove('drag-over');
  }

  function onDrop(e) {
    e.preventDefault();
    const colEl = e.target.closest('.plan-col');
    if (!colEl || !draggedId) return;
    const newCol = colEl.dataset.col;
    const t = state.tasks.find(x => x.id === draggedId);
    if (t) { t.col = newCol; renderTasks(); saveState(); }
    document.querySelectorAll('.task-row.drag-over').forEach(el => el.classList.remove('drag-over'));
  }

  function showAdd(col) {
    const row = document.getElementById('plan-input-row');
    row.style.display = 'flex';
    document.getElementById('plan-new-col').value = col;
    document.getElementById('plan-new-title').value = '';
    document.getElementById('plan-new-title').focus();
  }

  function addTask() {
    const title = document.getElementById('plan-new-title').value.trim();
    const prio = +document.getElementById('plan-new-prio').value;
    const col = document.getElementById('plan-new-col').value;
    const targetStr = document.getElementById('plan-new-target').value.trim();
    const icon = document.getElementById('plan-new-icon').value;
    if (!title) return;
    const target = parseDuration(targetStr) || 0;
    state.tasks.push({ id: 't' + Date.now(), title, col, prio, done: false, icon: icon || '', target: target, elapsed: 0, running: false, startedAt: 0, alerted: false });
    document.getElementById('plan-new-title').value = '';
    document.getElementById('plan-new-target').value = '';
    document.getElementById('plan-new-icon').value = '';
    document.getElementById('plan-input-row').style.display = 'none';
    renderTasks(); saveState();
  }

  /* ----------------------------------------
     TIMER — chronomètre par tâche
     ---------------------------------------- */
  let timerInterval = null;

  function parseDuration(str) {
    if (str == null) return 0;
    str = String(str).trim().toLowerCase();
    if (!str) return 0;
    // Colon form: "1:30" or "1:30:45" or "0:25"
    if (/^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(str)) {
      const parts = str.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    // Strip spaces, replace , with .
    str = str.replace(/\s+/g, '').replace(',', '.');
    let total = 0;
    const h = str.match(/(\d+(?:\.\d+)?)h/);
    const m = str.match(/(\d+(?:\.\d+)?)m/);
    const s = str.match(/(\d+(?:\.\d+)?)s/);
    const plain = str.match(/^(\d+(?:\.\d+)?)$/);
    if (h) total += parseFloat(h[1]) * 3600;
    if (m) total += parseFloat(m[1]) * 60;
    if (s) total += parseFloat(s[1]);
    if (plain) {
      const n = parseFloat(plain[1]);
      // Heuristic: > 24 = seconds, otherwise minutes
      total += n > 24 ? n : n * 60;
    }
    return Math.round(total);
  }

  function formatDuration(secs) {
    secs = Math.max(0, Math.floor(secs));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function liveElapsed(t) {
    if (!t) return 0;
    if (t.running && t.startedAt) return t.elapsed + Math.floor((Date.now() - t.startedAt) / 1000);
    return t.elapsed || 0;
  }

  function startTimer(id) {
    state.tasks.forEach(t => { if (t.running) stopTimer(t.id, true); });
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.running = true;
    t.startedAt = Date.now();
    t.alerted = false;
    saveState();
    renderTasks();
    ensureTimerLoop();
  }

  function stopTimer(id, silent) {
    const t = state.tasks.find(x => x.id === id);
    if (!t || !t.running) return;
    t.elapsed = (t.elapsed || 0) + Math.floor((Date.now() - t.startedAt) / 1000);
    t.running = false;
    t.startedAt = 0;
    saveState();
    if (!silent) renderTasks();
    checkTimerAlert(t);
  }

  function resetTimer(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.running = false;
    t.startedAt = 0;
    t.elapsed = 0;
    t.alerted = false;
    saveState();
    renderTasks();
  }

  function setTarget(id, secs) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    t.target = Math.max(0, Math.floor(secs));
    t.alerted = false;
    saveState();
    renderTasks();
  }

  function ensureTimerLoop() {
    if (timerInterval) return;
    timerInterval = setInterval(() => {
      let anyRunning = false;
      let needsAlert = false;
      state.tasks.forEach(t => {
        if (t.running) {
          anyRunning = true;
          if (t.target > 0 && !t.alerted && liveElapsed(t) >= t.target) {
            t.alerted = true;
            needsAlert = true;
            showTimerAlert(t);
          }
        }
      });
      // Update visible displays
      state.tasks.forEach(t => {
        const row = document.querySelector('.task-row[data-id="' + t.id + '"]');
        if (!row) return;
        const display = row.querySelector('.task-timer-display');
        const bar = row.querySelector('.task-timer-bar-fill');
        if (!display) return;
        const elapsed = liveElapsed(t);
        display.textContent = formatDuration(elapsed);
        if (t.target > 0) {
          if (elapsed >= t.target) {
            display.classList.add('over');
            row.classList.add('timer-done');
            row.classList.remove('timer-running');
            if (bar) { bar.style.width = '100%'; bar.classList.add('over'); }
          } else {
            display.classList.remove('over');
            row.classList.remove('timer-done');
            if (t.running) row.classList.add('timer-running'); else row.classList.remove('timer-running');
            if (bar) {
              const pct = Math.min(100, (elapsed / t.target) * 100);
              bar.style.width = pct + '%';
              bar.classList.remove('over');
            }
          }
        } else {
          row.classList.remove('timer-done', 'timer-running');
          if (t.running) row.classList.add('timer-running');
        }
      });
      if (!anyRunning) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
      if (needsAlert) saveState();
    }, 1000);
  }

  function showTimerAlert(t) {
    playBeep();
    showToast(t);
  }

  function playBeep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const beep = (freq, start, dur) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        g.gain.setValueAtTime(0, ctx.currentTime + start);
        g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
        o.start(ctx.currentTime + start);
        o.stop(ctx.currentTime + start + dur + 0.05);
      };
      beep(880, 0, 0.2);
      beep(1100, 0.25, 0.2);
      beep(1320, 0.5, 0.4);
      setTimeout(() => ctx.close(), 1200);
    } catch (e) {}
  }

  function showToast(t) {
    const old = document.getElementById('timer-active-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'timer-toast';
    el.id = 'timer-active-toast';
    el.innerHTML =
      '<div class="timer-toast-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C12 2 15 6 15 9C15 11.5 13.5 13 12 13C10.5 13 9 11.5 9 9C9 6 12 2 12 2Z" fill="currentColor"/><path d="M12 13V22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>' +
      '<div class="timer-toast-body"><div class="timer-toast-title">⏰ Temps écoulé</div><div class="timer-toast-desc">' + escHtml(t.title) + '</div></div>' +
      '<button class="timer-toast-close" aria-label="Fermer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
    document.body.appendChild(el);
    el.querySelector('.timer-toast-close').addEventListener('click', () => el.remove());
    setTimeout(() => { if (el.parentNode) el.remove(); }, 12000);
  }

  function promptTarget(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    openTimerPicker(t.target || 0, (secs) => {
      setTarget(id, secs);
    });
  }

  function openTimerPicker(initialSecs, onSave) {
    const overlay = document.getElementById('timer-overlay');
    if (!overlay) return;
    let currentSecs = initialSecs || 0;

    // Presets: highlight matching one
    const updateUI = () => {
      const presets = overlay.querySelectorAll('.timer-preset');
      presets.forEach(p => p.classList.toggle('active', +p.dataset.secs === currentSecs));
      const preview = overlay.querySelector('#timer-preview');
      preview.textContent = currentSecs > 0 ? formatDuration(currentSecs) : '0:00 — sans limite';
      preview.classList.toggle('zero', currentSecs === 0);
    };

    // Compute from h/m/s inputs
    const computeFromInputs = () => {
      const h = parseInt(overlay.querySelector('#timer-h').value, 10) || 0;
      const m = parseInt(overlay.querySelector('#timer-m').value, 10) || 0;
      const s = parseInt(overlay.querySelector('#timer-s').value, 10) || 0;
      const v = h * 3600 + m * 60 + s;
      if (v > 0) {
        currentSecs = v;
        overlay.querySelector('#timer-text').value = '';
      } else {
        currentSecs = 0;
      }
      updateUI();
    };

    // Compute from free text
    const computeFromText = () => {
      const txt = overlay.querySelector('#timer-text').value.trim();
      if (!txt) return;
      const v = parseDuration(txt);
      if (v > 0) {
        currentSecs = v;
        // Fill h/m/s
        overlay.querySelector('#timer-h').value = Math.floor(v / 3600);
        overlay.querySelector('#timer-m').value = Math.floor((v % 3600) / 60);
        overlay.querySelector('#timer-s').value = v % 60;
        updateUI();
      }
    };

    // Initial state
    if (initialSecs > 0) {
      overlay.querySelector('#timer-h').value = Math.floor(initialSecs / 3600);
      overlay.querySelector('#timer-m').value = Math.floor((initialSecs % 3600) / 60);
      overlay.querySelector('#timer-s').value = initialSecs % 60;
    } else {
      overlay.querySelector('#timer-h').value = '';
      overlay.querySelector('#timer-m').value = '';
      overlay.querySelector('#timer-s').value = '';
    }
    overlay.querySelector('#timer-text').value = '';
    updateUI();
    overlay.classList.add('show');

    // Preset clicks
    const presets = overlay.querySelectorAll('.timer-preset');
    const onPreset = (e) => {
      const secs = +e.currentTarget.dataset.secs;
      currentSecs = secs;
      overlay.querySelector('#timer-h').value = Math.floor(secs / 3600);
      overlay.querySelector('#timer-m').value = Math.floor((secs % 3600) / 60);
      overlay.querySelector('#timer-s').value = secs % 60;
      overlay.querySelector('#timer-text').value = '';
      updateUI();
    };
    presets.forEach(p => p.addEventListener('click', onPreset));

    // Inputs
    const hIn = overlay.querySelector('#timer-h');
    const mIn = overlay.querySelector('#timer-m');
    const sIn = overlay.querySelector('#timer-s');
    const tIn = overlay.querySelector('#timer-text');
    hIn.addEventListener('input', computeFromInputs);
    mIn.addEventListener('input', computeFromInputs);
    sIn.addEventListener('input', computeFromInputs);
    tIn.addEventListener('input', computeFromText);
    tIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); } });
    [hIn, mIn, sIn].forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); } }));

    // Buttons
    const close = () => {
      overlay.classList.remove('show');
      presets.forEach(p => p.removeEventListener('click', onPreset));
    };
    const saveBtn = overlay.querySelector('#timer-save');
    const cancelBtn = overlay.querySelector('#timer-cancel');
    const noTargetBtn = overlay.querySelector('#timer-no-target');

    const onSaveClick = () => { close(); onSave(currentSecs); };
    const onCancelClick = () => { close(); };
    const onNoTargetClick = () => { close(); onSave(0); };
    saveBtn.onclick = onSaveClick;
    cancelBtn.onclick = onCancelClick;
    noTargetBtn.onclick = onNoTargetClick;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    // Focus the minutes field
    setTimeout(() => { if (!initialSecs) mIn.focus(); else mIn.select(); }, 50);
  }

  function promptIcon(id) {
    const t = state.tasks.find(x => x.id === id);
    if (!t) return;
    const choices = Object.keys(TASK_ICONS).filter(k => k);
    const labels = {
      bath:'Bain/Douche', sport:'Sport', food:'Repas', work:'Travail', study:'Études',
      sleep:'Sommeil', meditate:'Méditation', call:'Appel', email:'Email', meeting:'Réunion',
      shop:'Courses', clean:'Ménage', cook:'Cuisine', music:'Musique', game:'Jeu',
      movie:'Film/Série', walk:'Marche', car:'Trajet', doctor:'Médecin', pill:'Médicament',
      money:'Argent', idea:'Idée', star:'Important'
    };
    const list = choices.map((k, i) => (i+1) + ' = ' + labels[k] + ' (' + k + ')').join('\n');
    const ans = prompt('Numéro de l\'icône (0 = aucune) :\n\n' + list + '\n\nActuelle : ' + (t.icon || 'aucune'), t.icon ? (choices.indexOf(t.icon)+1)+'' : '0');
    if (ans === null) return;
    const n = parseInt(ans.trim(), 10);
    if (isNaN(n)) return;
    if (n === 0) { t.icon = ''; }
    else if (n >= 1 && n <= choices.length) { t.icon = choices[n-1]; }
    else return;
    saveState();
    renderTasks();
  }

  /* ----------------------------------------
     FINANCES — CATEGORIES
     ---------------------------------------- */
  function renderFinanceCards() {
    const total = state.finances.categories.reduce((s, c) => s + c.spent, 0);
    const totalBudget = state.finances.categories.reduce((s, c) => s + c.budget, 0);
    const saveAmt = state.finances.categories.find(c => c.name === 'Épargne');
    document.getElementById('fin-total').textContent = formatXOF(totalBudget);
    document.getElementById('fin-spent').textContent = formatXOF(total);
    document.getElementById('fin-save').textContent = saveAmt ? formatXOF(saveAmt.spent) : '—';
  }

  function renderFinanceCats() {
    const catsEl = document.getElementById('fin-cats');
    catsEl.innerHTML = '';
    state.finances.categories.forEach(d => {
      const pct = Math.min(100, Math.round(d.spent / d.budget * 100));
      const isOver = pct > 100;
      const isWarning = pct >= 80 && pct <= 100;
      const div = document.createElement('div');
      div.className = 'fin-cat';
      div.innerHTML =
        '<div class="fin-cat-top"><span class="fin-cat-name">' + escHtml(d.name) + '</span><span class="fin-cat-amt">' + formatXOF(d.spent) + '</span></div>' +
        '<div class="fin-cat-bar">' +
          '<div class="fin-cat-bar-bg" style="width:100%;background:' + d.color + ';"></div>' +
          '<div class="fin-cat-fill" style="width:0%;background:' + d.color + ';"></div>' +
        '</div>' +
        '<div class="fin-cat-meta"><span>Budget: ' + formatXOF(d.budget) + '</span>' +
          (isOver ? '<span class="fin-cat-alert">' + warnSVG + 'Dépassé</span>' :
           isWarning ? '<span class="fin-cat-warning">' + warnSVG + 'Attention</span>' : '') +
        '</div>';
      catsEl.appendChild(div);
      // Animate fill
      requestAnimationFrame(() => {
        setTimeout(() => {
          div.querySelector('.fin-cat-fill').style.width = pct + '%';
        }, 100);
      });
    });
  }

  /* ----------------------------------------
     FINANCES — LINE CHART
     ---------------------------------------- */
  function animateChart() {
    const line = document.getElementById('fin-line');
    if (!line) return;
    line.classList.remove('fin-line-animated');
    void line.offsetWidth; // force reflow
    line.classList.add('fin-line-animated');
  }

  function renderFinanceChart() {
    // Generate dynamic 6-month chart from transactions
    const txs = state.finances.transactions || [];
    const monthMap = {};
    txs.forEach(t => {
      const month = t.date ? t.date.slice(0, 7) : null;
      if (!month) return;
      monthMap[month] = (monthMap[month] || 0) + Math.abs(t.amount);
    });
    const sortedMonths = Object.keys(monthMap).sort();
    const lastMonths = sortedMonths.slice(-6);
    // If fewer than 6, fill with empty strings or just show available
    const chartMonths = lastMonths.map(m => {
      const [y, mo] = m.split('-');
      return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('fr-FR', { month: 'short' });
    });
    const chartValues = lastMonths.map(m => monthMap[m]);

    // Fallback if no data
    if (chartMonths.length === 0) {
      chartMonths.push('Aucune donnée');
      chartValues.push(0);
    }

    const w = 600, h = 160, pad = 30;
    const max = Math.max(...chartValues) * 1.1;
    const min = Math.min(...chartValues) * 0.8;
    const pts = chartValues.map((v, i) => {
      const x = pad + (i / (chartValues.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
      return [x, y];
    });
    const lineD = 'M' + pts.map(p => p.join(',')).join(' L');
    const areaD = lineD + ' L' + pts[pts.length - 1][0] + ',' + (h - pad) + ' L' + pts[0][0] + ',' + (h - pad) + ' Z';

    document.getElementById('fin-line').setAttribute('d', lineD);
    document.getElementById('fin-area').setAttribute('d', areaD);

    const pointsG = document.getElementById('fin-points');
    const labelsG = document.getElementById('fin-labels');
    pointsG.innerHTML = '';
    labelsG.innerHTML = '';
    pts.forEach((p, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', '4');
      c.setAttribute('fill', 'var(--accent)');
      pointsG.appendChild(c);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', p[0]); t.setAttribute('y', h - 8);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', '#6e6e80');
      t.setAttribute('font-size', '11');
      t.textContent = chartMonths[i];
      labelsG.appendChild(t);
    });
  }

  /* ----------------------------------------
     FINANCES — DONUT CHART
     ---------------------------------------- */
  function renderDonut() {
    const container = document.getElementById('fin-donut');
    if (!container) return;
    const cats = state.finances.categories;
    const total = cats.reduce((s, c) => s + c.spent, 0);
    if (total === 0) { container.innerHTML = ''; return; }

    const size = 140, cx = size / 2, cy = size / 2, r = 52;
    const circumference = 2 * Math.PI * r;
    let accumulated = 0;

    let circlesHtml = '';
    cats.forEach((cat, i) => {
      const pct = cat.spent / total;
      const dashLen = pct * circumference;
      const dashOff = -accumulated * circumference;
      circlesHtml +=
        '<circle class="fin-donut-segment" cx="' + cx + '" cy="' + cy + '" r="' + r +
        '" fill="none" stroke="' + cat.color + '" stroke-width="20" ' +
        'stroke-dasharray="' + dashLen + ' ' + (circumference - dashLen) + '" ' +
        'stroke-dashoffset="' + dashOff + '" ' +
        'transform="rotate(-90 ' + cx + ' ' + cy + ')" ' +
        'data-cat="' + escHtml(cat.name) + '" data-pct="' + Math.round(pct * 100) + '"/>';
      accumulated += pct;
    });

    let legendHtml = '';
    cats.forEach(cat => {
      const pct = Math.round(cat.spent / total * 100);
      legendHtml +=
        '<div class="fin-donut-legend-item">' +
          '<div class="fin-donut-legend-dot" style="background:' + cat.color + '"></div>' +
          '<span>' + escHtml(cat.name) + '</span>' +
          '<span class="fin-donut-legend-pct">' + pct + '%</span>' +
        '</div>';
    });

    container.innerHTML =
      '<svg class="fin-donut-svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
        circlesHtml +
        '<text class="fin-donut-center" x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central">' +
          formatXOF(total) +
        '</text>' +
      '</svg>' +
      '<div class="fin-donut-legend">' + legendHtml + '</div>';
  }

  /* ----------------------------------------
     FINANCES — TRANSACTIONS CRUD
     ---------------------------------------- */
  let txEditId = null;

  function renderTransactions() {
    const list = document.getElementById('fin-tx-list');
    if (!list) return;

    let txs = [...state.finances.transactions];
    // Sort by date descending
    txs.sort((a, b) => b.date.localeCompare(a.date));

    // Filters
    const catFilter = document.getElementById('tx-filter-cat');
    const monthFilter = document.getElementById('tx-filter-month');
    if (catFilter && catFilter.value) txs = txs.filter(t => t.cat === catFilter.value);
    if (monthFilter && monthFilter.value) txs = txs.filter(t => t.date.startsWith(monthFilter.value));

    if (txs.length === 0) {
      list.innerHTML = '<div class="fin-tx-empty">Aucune transaction</div>';
      return;
    }

    list.innerHTML = '';
    txs.forEach(tx => {
      const row = document.createElement('div');
      row.className = 'fin-tx-row';
      const isNeg = tx.amount < 0;
      row.innerHTML =
        '<div class="fin-tx-date">' + formatDate(tx.date) + '</div>' +
        '<div class="fin-tx-desc">' + escHtml(tx.desc) + '</div>' +
        '<div class="fin-tx-cat">' + escHtml(tx.cat) + '</div>' +
        '<div class="fin-tx-amount ' + (isNeg ? 'negative' : 'positive') + '">' +
          (isNeg ? '-' : '+') + formatXOF(Math.abs(tx.amount)) +
        '</div>' +
        '<div class="fin-tx-actions">' +
          '<button class="edit-btn" aria-label="Modifier" data-id="' + tx.id + '">' + editSVG + '</button>' +
          '<button class="del-btn" aria-label="Supprimer" data-id="' + tx.id + '">' + delSVG + '</button>' +
        '</div>';
      row.querySelector('.edit-btn').addEventListener('click', () => openTxModal(tx.id));
      row.querySelector('.del-btn').addEventListener('click', () => removeTx(tx.id));
      list.appendChild(row);
    });
  }

  function populateTxFilters() {
    const catSelect = document.getElementById('tx-filter-cat');
    const monthSelect = document.getElementById('tx-filter-month');
    if (!catSelect || !monthSelect) return;

    const cats = [...new Set(state.finances.transactions.map(t => t.cat))].sort();
    catSelect.innerHTML = '<option value="">Toutes</option>' + cats.map(c => '<option value="' + escHtml(c) + '">' + escHtml(c) + '</option>').join('');

    const months = [...new Set(state.finances.transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
    monthSelect.innerHTML = '<option value="">Tous</option>' + months.map(m => {
      const [y, mo] = m.split('-');
      const label = new Date(y, mo - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return '<option value="' + m + '">' + label + '</option>';
    }).join('');
  }

  function openTxModal(editId) {
    txEditId = editId || null;
    const modal = document.getElementById('tx-modal-overlay');
    const titleEl = document.getElementById('tx-modal-title');
    const delBtn = document.getElementById('tx-modal-delete');

    if (txEditId) {
      const tx = state.finances.transactions.find(t => t.id === txEditId);
      if (tx) {
        titleEl.textContent = 'Modifier la transaction';
        delBtn.style.display = 'flex';
        document.getElementById('tx-date').value = tx.date;
        document.getElementById('tx-desc').value = tx.desc;
        document.getElementById('tx-cat').value = tx.cat;
        document.getElementById('tx-amount').value = tx.amount;
      }
    } else {
      titleEl.textContent = 'Nouvelle transaction';
      delBtn.style.display = 'none';
      document.getElementById('tx-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('tx-desc').value = '';
      document.getElementById('tx-cat').value = 'Logement';
      document.getElementById('tx-amount').value = '';
    }
    if (modal) modal.classList.add('show');
    document.getElementById('tx-desc').focus();
  }

  function closeTxModal() {
    const m = document.getElementById('tx-modal-overlay');
    if (m) m.classList.remove('show');
    txEditId = null;
  }

  function saveTx() {
    const date = document.getElementById('tx-date').value;
    const desc = document.getElementById('tx-desc').value.trim();
    const cat = document.getElementById('tx-cat').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);
    if (!date || !desc || isNaN(amount)) return;

    if (txEditId) {
      const tx = state.finances.transactions.find(t => t.id === txEditId);
      if (tx) { tx.date = date; tx.desc = desc; tx.cat = cat; tx.amount = amount; }
    } else {
      state.finances.transactions.push({ id: 'fx' + Date.now(), date, desc, cat, amount });
    }

    // Update category spent
    updateCategorySpent();
    closeTxModal();
    renderTransactions();
    renderFinanceCats();
    renderFinanceCards();
    renderDonut();
    saveState();
  }

  function removeTx(id) {
    if (!confirm('Supprimer cette transaction ?')) return;
    state.finances.transactions = state.finances.transactions.filter(t => t.id !== id);
    updateCategorySpent();
    renderTransactions();
    renderFinanceCats();
    renderFinanceCards();
    renderDonut();
    saveState();
  }

  function updateCategorySpent() {
    state.finances.categories.forEach(cat => {
      const total = state.finances.transactions
        .filter(t => t.cat === cat.name)
        .reduce((s, t) => s + Math.abs(t.amount), 0);
      cat.spent = total;
    });
  }

  /* ----------------------------------------
     OBJECTIVES — RENDER (rings + list) CRUD
     ---------------------------------------- */

  function renderObjectives() {
    renderObjSection('week', 'obj-week-grid', 'obj-week-list');
    renderObjSection('month', 'obj-month-grid', 'obj-month-list');
    renderObjSection('year', 'obj-year-grid', 'obj-year-list');
  }

  function renderObjSection(sec, gridId, listId) {
    const items = state.objectives[sec] || [];
    const rings = items.filter(i => i.type === 'ring');
    const lists = items.filter(i => i.type === 'list');

    const grid = document.getElementById(gridId);
    const list = document.getElementById(listId);
    if (grid) renderObjRings(grid, rings, sec);
    if (list) renderObjRows(list, lists, sec);
  }

  function renderObjRings(grid, rings, sec) {
    grid.innerHTML = '';
    rings.forEach(o => {
      const card = document.createElement('div');
      card.className = 'obj-card';
      const color = o.color || 'var(--accent)';
      const off = Math.round((1 - o.pct / 100) * 213.6);
      card.innerHTML =
        '<div class="obj-card-title">' + escHtml(o.label) + '</div>' +
        '<div class="obj-card-actions">' +
          '<button class="edit-btn" aria-label="Modifier" data-sec="' + sec + '" data-id="' + o.id + '">' + editSVG + '</button>' +
          '<button class="del-btn" aria-label="Supprimer" data-sec="' + sec + '" data-id="' + o.id + '">' + delSVG + '</button>' +
        '</div>' +
        '<div class="obj-ring">' +
          '<svg width="80" height="80" viewBox="0 0 80 80">' +
            '<circle class="obj-ring-track" cx="40" cy="40" r="34"/>' +
            '<circle class="obj-ring-fill" cx="40" cy="40" r="34" stroke-dasharray="213.6" stroke-dashoffset="213.6" style="stroke:' + color + '"/>' +
          '</svg>' +
          '<div class="obj-ring-text">' + o.pct + '%</div>' +
        '</div>' +
        '<div class="obj-card-sub">' + (o.sub ? escHtml(o.sub) : '') + '</div>';

      attachObjCardEvents(card, o, sec);
      grid.appendChild(card);
      // Animate ring
      requestAnimationFrame(() => {
        setTimeout(() => {
          card.querySelector('.obj-ring-fill').style.strokeDashoffset = off;
        }, 100);
      });
    });
  }

  function renderObjRows(list, items, sec) {
    list.innerHTML = '';
    items.forEach(o => {
      const row = document.createElement('div');
      row.className = 'obj-row';
      row.innerHTML =
        '<div class="obj-row-left">' +
          '<div class="obj-row-icon" style="background:' + hexToRgba(o.color, 0.12) + '; color:' + o.color + ';">' +
            arrowUpSVG +
          '</div>' +
          '<div class="obj-row-text">' + escHtml(o.name) + '</div>' +
        '</div>' +
        '<div class="obj-row-val" style="color:' + o.color + '">' + escHtml(o.val) + '</div>' +
        '<div class="obj-row-actions">' +
          '<button class="edit-btn" aria-label="Modifier" data-sec="' + sec + '" data-id="' + o.id + '">' + editSVG + '</button>' +
          '<button class="del-btn" aria-label="Supprimer" data-sec="' + sec + '" data-id="' + o.id + '">' + delSVG + '</button>' +
        '</div>';
      row.querySelector('.edit-btn').addEventListener('click', () => openObjModal(sec, o.id));
      row.querySelector('.del-btn').addEventListener('click', () => removeObj(sec, o.id));
      list.appendChild(row);
    });
  }

  function attachObjCardEvents(card, o, sec) {
    card.querySelector('.edit-btn').addEventListener('click', () => openObjModal(sec, o.id));
    card.querySelector('.del-btn').addEventListener('click', () => removeObj(sec, o.id));
  }

  /* ----------------------------------------
     OBJECTIVES — MODAL CRUD
     ---------------------------------------- */
  let objEditSec = null;
  let objEditId = null;
  let objSelectedType = 'ring';

  function openObjModal(sec, editId, defaultType) {
    objEditSec = sec;
    objEditId = editId || null;
    const modal = document.getElementById('obj-modal-overlay');
    document.getElementById('obj-modal-title').textContent = editId ? 'Modifier' : 'Nouveau';
    document.getElementById('obj-modal-delete').style.display = editId ? 'flex' : 'none';

    if (editId) {
      const o = (state.objectives[sec] || []).find(i => i.id === editId);
      if (o) {
        setObjType(o.type);
        if (o.type === 'ring') {
          document.getElementById('obj-label').value = o.label;
          document.getElementById('obj-pct').value = o.pct;
          document.getElementById('obj-sub').value = o.sub || '';
        } else {
          document.getElementById('obj-name').value = o.name;
          document.getElementById('obj-val').value = o.val || '';
        }
        document.getElementById('obj-color').value = o.color || '#6b8afd';
      }
    } else {
      setObjType(defaultType || 'ring');
      document.getElementById('obj-label').value = '';
      document.getElementById('obj-pct').value = '';
      document.getElementById('obj-sub').value = '';
      document.getElementById('obj-name').value = '';
      document.getElementById('obj-val').value = '';
      document.getElementById('obj-color').value = '#6b8afd';
    }
    if (modal) modal.classList.add('show');
  }

  function closeObjModal() {
    const m = document.getElementById('obj-modal-overlay');
    if (m) m.classList.remove('show');
  }

  function setObjType(type) {
    objSelectedType = type;
    document.querySelectorAll('.obj-type-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.otype === type);
    });
    document.querySelectorAll('.obj-fields').forEach(f => {
      f.style.display = f.dataset.fields === type ? 'block' : 'none';
    });
  }

  function objModalSave() {
    if (!objEditSec) return;
    const sec = objEditSec;
    const items = state.objectives[sec] || (state.objectives[sec] = []);
    const type = objSelectedType;

    if (type === 'ring') {
      const label = document.getElementById('obj-label').value.trim();
      let pct = Math.max(0, Math.min(100, parseInt(document.getElementById('obj-pct').value, 10) || 0));
      const sub = document.getElementById('obj-sub').value.trim();
      const color = document.getElementById('obj-color').value;
      if (!label) return;
      if (objEditId) {
        const o = items.find(i => i.id === objEditId);
        if (o) { o.label = label; o.pct = pct; o.sub = sub; o.color = color; }
      } else {
        items.push({ id: genId(sec, 'ring'), type: 'ring', label, pct, sub, color });
      }
    } else {
      const name = document.getElementById('obj-name').value.trim();
      const val = document.getElementById('obj-val').value.trim();
      const color = document.getElementById('obj-color').value;
      if (!name) return;
      if (objEditId) {
        const o = items.find(i => i.id === objEditId);
        if (o) { o.name = name; o.val = val; o.color = color; }
      } else {
        items.push({ id: genId(sec, 'list'), type: 'list', name, val, color });
      }
    }

    closeObjModal();
    renderObjectives();
    saveState();
  }

  function removeObj(sec, id) {
    if (!confirm('Supprimer cet objectif ?')) return;
    state.objectives[sec] = (state.objectives[sec] || []).filter(i => i.id !== id);
    renderObjectives();
    saveState();
  }

  function genId(sec, type) {
    return sec + type[0] + Date.now().toString(36);
  }

  /* ----------------------------------------
     BLOC-NOTES
     ---------------------------------------- */
  let noteEditId = null;
  let noteListVisible = true;

  function renderNotes() {
    const grid = document.getElementById('note-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const searchInput = document.getElementById('note-search');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let notes = [...state.notes].sort((a, b) => b.updated - a.updated);
    if (q) {
      notes = notes.filter(n => {
        const titleMatch = (n.title || '').toLowerCase().includes(q);
        const bodyMatch = (n.body || '').toLowerCase().includes(q);
        return titleMatch || bodyMatch;
      });
    }
    document.getElementById('note-count').textContent = notes.length + ' note' + (notes.length > 1 ? 's' : '');

    if (notes.length === 0) {
      grid.innerHTML = '<div class="note-empty">Aucune note. Cliquez sur « Nouvelle note » pour commencer.</div>';
      return;
    }

    notes.forEach(n => {
      if (!n || typeof n !== 'object' || typeof n.body !== 'string') return; // skip malformed
      const card = document.createElement('div');
      card.className = 'note-card';
      card.setAttribute('role', 'listitem');
      card.tabIndex = 0;
      const preview = n.body.replace(/\n+/g, ' ').trim();
      const date = formatNoteDate(n.updated);
      card.innerHTML =
        '<div class="note-card-title">' + (escHtml(n.title) || 'Sans titre') + '</div>' +
        '<div class="note-card-preview">' + (preview ? escHtml(preview) : '<em>' + escHtml(n.title) + '</em>') + '</div>' +
        '<div class="note-card-date">' + date + '</div>' +
        '<button class="note-card-del" aria-label="Supprimer la note">' + delSVG + '</button>';
      card.addEventListener('click', () => openNoteEditor(n.id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNoteEditor(n.id); }
      });
      card.querySelector('.note-card-del').addEventListener('click', e => {
        e.stopPropagation();
        removeNote(n.id);
      });
      grid.appendChild(card);
    });
  }

  function openNoteEditor(id) {
    noteEditId = id;
    const note = state.notes.find(n => n.id === id);
    if (!note) return;
    document.getElementById('note-grid').style.display = 'none';
    document.getElementById('note-toolbar').style.display = 'none';
    const editor = document.getElementById('note-editor');
    editor.style.display = 'flex';
    document.getElementById('note-title').value = note.title;
    document.getElementById('note-body').value = note.body;
    renderNoteHistory(note);
    document.getElementById('note-body').focus();
  }

  function openNewNote() {
    const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    state.notes.push({ id, title: '', body: '', updated: Date.now(), history: [] });
    saveState();
    openNoteEditor(id);
  }

  function closeNoteEditor() {
    document.getElementById('note-editor').style.display = 'none';
    document.getElementById('note-grid').style.display = '';
    document.getElementById('note-toolbar').style.display = '';
    noteEditId = null;
    renderNotes();
  }

  function saveNoteEditor() {
    if (!noteEditId) return;
    const note = state.notes.find(n => n.id === noteEditId);
    if (note) {
      const title = document.getElementById('note-title').value.trim();
      const body = document.getElementById('note-body').value;
      const changed = note.title !== title || note.body !== body;
      if (changed && (note.title || note.body)) {
        note.history.unshift({ title: note.title, body: note.body, ts: note.updated || Date.now() });
        if (note.history.length > 20) note.history.length = 20;
      }
      note.title = title;
      note.body = body;
      note.updated = Date.now();
      saveState();
    }
    closeNoteEditor();
  }

  function renderNoteHistory(note) {
    const list = document.getElementById('note-history-list');
    const count = document.getElementById('note-history-count');
    if (!list || !count) return;
    const versions = note.history || [];
    count.textContent = versions.length + ' version' + (versions.length > 1 ? 's' : '');
    if (versions.length === 0) {
      list.innerHTML = '<div class="note-history-empty">Aucune version — sauvegardez pour créer un point de restauration.</div>';
      return;
    }
    list.innerHTML = '';
    versions.forEach((v, i) => {
      const item = document.createElement('div');
      item.className = 'note-history-item';
      const preview = (v.title || 'Sans titre') + (v.body ? ' — ' + v.body.replace(/\n+/g, ' ').slice(0, 40) : '');
      item.innerHTML =
        '<span class="h-desc">' + escHtml(preview) + '</span>' +
        '<span class="h-date">' + formatNoteDate(v.ts) + '</span>' +
        '<button class="h-restore" data-i="' + i + '">Restaurer</button>';
      item.querySelector('.h-restore').addEventListener('click', () => restoreNoteVersion(note.id, i));
      list.appendChild(item);
    });
  }

  function restoreNoteVersion(id, idx) {
    const note = state.notes.find(n => n.id === id);
    if (!note || !note.history || !note.history[idx]) return;
    const v = note.history[idx];
    note.title = v.title;
    note.body = v.body;
    note.updated = Date.now();
    saveState();
    document.getElementById('note-title').value = note.title;
    document.getElementById('note-body').value = note.body;
    renderNoteHistory(note);
  }

  function removeNote(id) {
    if (!confirm('Supprimer cette note ?')) return;
    state.notes = state.notes.filter(n => n.id !== id);
    if (noteEditId === id) closeNoteEditor();
    else renderNotes();
    saveState();
  }

  function formatNoteDate(ts) {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return 'Aujourd\'hui à ' + time;
    const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return dateStr + ' à ' + time;
  }

  /* ----------------------------------------
     COMPACT MODE
     ---------------------------------------- */
  function toggleCompact() {
    state.settings.compact = !state.settings.compact;
    document.body.classList.toggle('compact', state.settings.compact);
    document.querySelector('.db-compact-toggle').classList.toggle('active', state.settings.compact);
    saveState();
  }

  /* ----------------------------------------
     FOCUS MODE — Présenter le bloc horaire actuel
     Détecte l'heure, présente le bloc correspondant
     en grand avec animation fluide.
     ---------------------------------------- */
  function updatePlanGridOrder() {
    const block = getCurrentBlock();
    const grid = document.querySelector('.plan-grid');
    if (!grid) return;
    grid.classList.remove('current-matin', 'current-apres', 'current-soir');
    grid.classList.add('current-' + block.key);
  }

  function getCurrentBlock() {
    const h = new Date().getHours();
    if (h < 12) return { key: 'matin',   label: 'Matin',       range: '06h — 12h',  greeting: 'Bonjour' };
    if (h < 18) return { key: 'apres',   label: 'Après-midi',  range: '12h — 18h',  greeting: 'Bon après-midi' };
    return       { key: 'soir',   label: 'Soir',       range: '18h — 00h', greeting: 'Bonsoir' };
  }

  function openFocus() {
    const overlay = document.getElementById('focus-overlay');
    if (!overlay) return;
    const block = getCurrentBlock();
    const tasks = (state.tasks || []).filter(t => t.col === block.key);
    const now = new Date();
    const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    // Eyebrow + title + time
    overlay.querySelector('#focus-eyebrow').textContent = block.range + '  ·  ' + block.greeting;
    overlay.querySelector('#focus-title').textContent = 'Votre ' + block.label.toLowerCase();
    overlay.querySelector('#focus-time').textContent = 'Présenté à ' + timeStr;

    // Tasks list
    const list = overlay.querySelector('#focus-tasks');
    list.innerHTML = '';
    if (tasks.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'focus-empty';
      empty.textContent = 'Aucune tâche pour le ' + block.label.toLowerCase() + '. Profitez de ce moment.';
      list.appendChild(empty);
    } else {
      tasks.forEach((t, i) => {
        const el = document.createElement('div');
        el.className = 'focus-task' + (t.done ? ' checked' : '');
        el.style.transitionDelay = (0.3 + i * 0.06) + 's';
        const icon = iconFor(t);
        const stars = Array(t.prio || 0).fill('<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.5 6.5L21 9.5l-5.5 4.5L17.5 21 12 17.5 6.5 21 8.5 14 3 9.5l6.5-1L12 2z"/></svg>').join('');
        const elapsed = liveElapsed(t);
        const isOver = t.target > 0 && elapsed >= t.target;
        let timerBadge = '';
        if (t.running) {
          timerBadge = '<div class="focus-task-timer running">● ' + formatDuration(elapsed) + '</div>';
        } else if (t.target > 0) {
          timerBadge = '<div class="focus-task-timer ' + (isOver ? 'over' : '') + '">' + formatDuration(elapsed) + ' / ' + formatDuration(t.target) + '</div>';
        } else if (elapsed > 0) {
          timerBadge = '<div class="focus-task-timer">' + formatDuration(elapsed) + '</div>';
        }
        el.innerHTML =
          '<div class="focus-task-check" role="checkbox" aria-checked="' + (t.done ? 'true' : 'false') + '" tabindex="0">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M17.136 8.564a1 1 0 010 1.414l-7.348 7.348a1 1 0 01-1.414 0L4.732 13.273a1 1 0 011.414-1.414l3.006 3.006 6.641-6.641a1 1 0 011.414 0z" fill="currentColor"/></svg>' +
          '</div>' +
          (icon ? '<div class="focus-task-icon">' + icon + '</div>' : '<div style="width:36px;height:36px;flex-shrink:0"></div>') +
          '<div class="focus-task-body">' +
            '<div class="focus-task-title">' + escHtml(t.title) + '</div>' +
            '<div class="focus-task-sub"><div class="focus-task-stars">' + stars + '</div></div>' +
          '</div>' +
          timerBadge;

        // Toggle done on click
        const check = el.querySelector('.focus-task-check');
        const toggle = (e) => {
          e.stopPropagation();
          toggleTask(t.id);
          openFocus(); // re-render to reflect state
        };
        check.addEventListener('click', toggle);
        check.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });

        list.appendChild(el);
      });
    }

    // Progress in footer
    const done = tasks.filter(t => t.done).length;
    overlay.querySelector('#focus-progress').textContent = done + ' / ' + tasks.length + ' terminées';

    // Show with animation
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeFocus() {
    const overlay = document.getElementById('focus-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    try { sessionStorage.setItem('focus-dismissed', '1'); } catch (e) {}
  }

  /* ----------------------------------------
     SWIPE (mobile)
     ---------------------------------------- */
  let touchStartX = 0;
  let touchStartY = 0;
  const TAB_ORDER = ['planning', 'finances', 'objectifs', 'notes'];

  function onTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }

  function onTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    const idx = TAB_ORDER.indexOf(state.settings.tab);
    if (dx < 0 && idx < TAB_ORDER.length - 1) switchTab(TAB_ORDER[idx + 1]);
    else if (dx > 0 && idx > 0) switchTab(TAB_ORDER[idx - 1]);
  }

  /* ----------------------------------------
     UTILITIES
     ---------------------------------------- */
  function escHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatXOF(n) {
    return Math.round(n).toLocaleString('fr-FR') + ' XOF';
  }

  function formatDate(iso) {
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y.slice(2);
  }

  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ----------------------------------------
     INIT
     ---------------------------------------- */
  let initRan = false;
  function init() {
    if (initRan) return;
    initRan = true;
    loadState();

    // Apply settings
    setAccent(state.settings.accent);
    document.body.classList.toggle('compact', state.settings.compact);

    // Render all (isolated so a failure elsewhere never blocks the rest)
    try { renderTasks(); } catch (e) { console.error('renderTasks', e); }
    try { renderFinanceCards(); } catch (e) { console.error('renderFinanceCards', e); }
    try { renderFinanceCats(); } catch (e) { console.error('renderFinanceCats', e); }
    try { renderFinanceChart(); } catch (e) { console.error('renderFinanceChart', e); }
    try { renderObjectives(); } catch (e) { console.error('renderObjectives', e); }
    try { renderNotes(); } catch (e) { console.error('renderNotes', e); }
    try { populateTxFilters(); } catch (e) { console.error('populateTxFilters', e); }
    try { renderTransactions(); } catch (e) { console.error('renderTransactions', e); }

    try { checkDayReset(); renderStreak(); updatePlanGridOrder(); } catch (e) { console.error('day reset/order', e); }

    // Activate saved tab
    try { switchTab(state.settings.tab); } catch (e) { console.error('switchTab', e); }

    // Bind accent dots
    try {
      document.querySelectorAll('.db-accent-dot').forEach(dot => {
        dot.addEventListener('click', () => setAccent(dot.dataset.color));
      });
    } catch (e) { console.error('accent dots', e); }

    // Compact toggle
    try { document.querySelector('.db-compact-toggle').addEventListener('click', toggleCompact); } catch (e) { console.error('compact bind', e); }

    // Focus mode
    try {
      const focusBtn = document.getElementById('db-focus-btn');
      if (focusBtn) focusBtn.addEventListener('click', openFocus);
      const focusClose = document.getElementById('focus-close');
      if (focusClose) focusClose.addEventListener('click', closeFocus);
      const focusOverlay = document.getElementById('focus-overlay');
      if (focusOverlay) {
        focusOverlay.addEventListener('click', e => {
          if (e.target === focusOverlay || e.target.classList.contains('focus-bg')) closeFocus();
        });
      }
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          const fo = document.getElementById('focus-overlay');
          if (fo && fo.classList.contains('show')) closeFocus();
        }
      });


    } catch (e) { console.error('focus bind', e); }

    // Tabs
    try {
      document.querySelectorAll('.db-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
      });
    } catch (e) { console.error('tabs', e); }

    // Planning drag zones + add buttons
    try {
      document.querySelectorAll('.plan-col').forEach(col => {
        col.addEventListener('dragover', onDragOver);
        col.addEventListener('dragleave', onDragLeave);
        col.addEventListener('drop', onDrop);
      });
      document.querySelectorAll('.plan-add[data-show-col]').forEach(btn => {
        btn.addEventListener('click', () => showAdd(btn.dataset.showCol));
      });
    } catch (e) { console.error('planning bindings', e); }

    // Transaction modal
    try {
      document.getElementById('tx-modal-close').addEventListener('click', closeTxModal);
      document.getElementById('tx-modal-save').addEventListener('click', saveTx);
      document.getElementById('tx-modal-delete').addEventListener('click', () => {
        if (txEditId) removeTx(txEditId);
        closeTxModal();
      });
      document.getElementById('tx-modal-overlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeTxModal();
      });
    } catch (e) { console.error('tx modal bindings', e); }

    // Objective modal
    try {
      document.getElementById('obj-modal-close').addEventListener('click', closeObjModal);
      document.getElementById('obj-modal-save').addEventListener('click', objModalSave);
      document.getElementById('obj-modal-delete').addEventListener('click', () => {
        if (objEditSec && objEditId) removeObj(objEditSec, objEditId);
        closeObjModal();
      });
      document.getElementById('obj-modal-overlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeObjModal();
      });
      document.querySelectorAll('.obj-type-tab').forEach(tab => {
        tab.addEventListener('click', () => setObjType(tab.dataset.otype));
      });

      // Objective add buttons
      document.querySelectorAll('.obj-add-ring').forEach(btn => {
        btn.addEventListener('click', () => openObjModal(btn.dataset.sec, null, 'ring'));
      });
      document.querySelectorAll('.obj-add-item').forEach(btn => {
        btn.addEventListener('click', () => openObjModal(btn.dataset.sec, null, 'list'));
      });
    } catch (e) { console.error('obj modal bindings', e); }

    // Notes: bindings via event delegation (see bottom) so they survive any init failure
    try {
      const addBtn = document.getElementById('note-add-btn');
      if (addBtn) addBtn.setAttribute('data-bound', 'delegated');
      if (!document.getElementById('note-save-btn')) console.error('note-save-btn manquant');
    } catch (e) { console.error('notes bindings', e); }

    function resumeTaskFromHistory() {
    const historique = state.settings.historiqueTaches || [];
    if (historique.length === 0) {
      alert('Aucune tâche précédente dans l\'historique.');
      return;
    }
    const list = historique.map((t, i) => (i + 1) + '. ' + (t.title || 'Sans titre') + ' (' + (t.col || 'inconnu') + ')').join('\n');
    const ans = prompt('Choisissez le numéro de la tâche à reprendre :\n\n' + list + '\n\n(0 pour annuler)');
    if (ans === null || ans.trim() === '' || ans.trim() === '0') return;
    const n = parseInt(ans.trim(), 10);
    if (isNaN(n) || n < 1 || n > historique.length) return;
    const t = historique[n - 1];
    // Restaurer la tâche dans le planning actuel
    state.tasks.push({
      id: 't' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
      title: t.title || '',
      col: t.col || 'matin',
      prio: t.prio || 3,
      done: false,
      icon: t.icon || '',
      target: 0,
      elapsed: 0,
      running: false,
      startedAt: 0,
      alerted: false
    });
    renderTasks();
    saveState();
  }

      // Planning resume button
      const resumeBtn = document.getElementById('plan-resume-btn');
      if (resumeBtn) resumeBtn.addEventListener('click', resumeTaskFromHistory);

      // Planning filters
    try {
      document.getElementById('plan-filter-prio').addEventListener('change', renderTasks);
      document.getElementById('plan-filter-icon').addEventListener('change', renderTasks);
    } catch (e) { console.error('planning filters', e); }

    // Note search
    try {
      const noteSearch = document.getElementById('note-search');
      if (noteSearch) noteSearch.addEventListener('input', () => renderNotes());
    } catch (e) { console.error('note search bind', e); }

    // Transaction filters
    try {
      const catFilter = document.getElementById('tx-filter-cat');
      const monthFilter = document.getElementById('tx-filter-month');
      if (catFilter) catFilter.addEventListener('change', renderTransactions);
      if (monthFilter) monthFilter.addEventListener('change', renderTransactions);

      // Add task / Add tx buttons
      document.getElementById('plan-add-btn').addEventListener('click', () => {
        document.getElementById('plan-input-row').style.display = 'flex';
        document.getElementById('plan-new-title').focus();
      });
      document.getElementById('plan-save-btn').addEventListener('click', addTask);
      document.getElementById('plan-new-title').addEventListener('keydown', e => {
        if (e.key === 'Enter') addTask();
      });
      document.getElementById('tx-add-btn').addEventListener('click', () => openTxModal());
    } catch (e) { console.error('filters/add bindings', e); }

    // Swipe
    try {
      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('touchend', onTouchEnd, { passive: true });
    } catch (e) { console.error('swipe bindings', e); }

    // Keyboard: arrow keys for tabs
    try {
      document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        const idx = TAB_ORDER.indexOf(state.settings.tab);
        if (e.key === 'ArrowRight' && idx < TAB_ORDER.length - 1) switchTab(TAB_ORDER[idx + 1]);
        if (e.key === 'ArrowLeft' && idx > 0) switchTab(TAB_ORDER[idx - 1]);
      });
    } catch (e) { console.error('keyboard bindings', e); }

    // Animate chart on first finance view
    try { setTimeout(animateChart, 300); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', init);

  // Reliable init: if the DOM is already parsed, run init right away
  if (document.readyState === 'interactive' || document.readyState === 'complete') init();

  // Safety net: global error banner so any runtime failure becomes visible
  function showFatalBanner(msg) {
    try {
      let b = document.getElementById('fatal-banner');
      if (!b) {
        b = document.createElement('div');
        b.id = 'fatal-banner';
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#a33;color:#fff;font:12px/1.4 sans-serif;padding:8px 12px;';
        document.body.appendChild(b);
      }
      b.textContent = 'Erreur : ' + msg;
    } catch (e2) { /* ignore */ }
  }
  window.addEventListener('error', e => showFatalBanner(e.message || 'inconnue'));
  window.addEventListener('unhandledrejection', e => showFatalBanner((e.reason && e.reason.message) || 'promesse rejetée'));

  // Click anywhere removes flame center animation
  document.addEventListener('click', (e) => {
    const flame = document.getElementById('streak-flame');
    if (flame && flame.classList.contains('flame-active')) {
      flame.classList.remove('flame-active');
    }
  });

  // Event delegation for the note buttons: they work even if direct bindings failed
  document.addEventListener('click', e => {
    const btn = e.target && e.target.closest ? e.target.closest('#note-add-btn, #note-save-btn, #note-back-btn') : null;
    if (btn) {
      try {
        if (btn.id === 'note-add-btn') openNewNote();
        if (btn.id === 'note-save-btn') saveNoteEditor();
        if (btn.id === 'note-back-btn') closeNoteEditor();
      } catch (err) { showFatalBanner(err.message); }
    }
  });

})();
