/* ===== ANTI MARKARYD — App Logic ===== */

const SUPABASE_URL = 'https://eqwlikflvpyghkvhsxmz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eGjEo-jwcsyFEJLCyfoPJw_mtXXO9Rp';

// DOM refs (safe even if library fails)
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const userEmailEl = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const gameModal = document.getElementById('game-modal');
const gameTitle = document.getElementById('game-title');
const gameContainer = document.getElementById('game-container');
const closeGameBtn = document.getElementById('close-game');
const welcomeTitle = document.getElementById('welcome-title');
const certFileInput = document.getElementById('cert-file');
const certStatus = document.getElementById('cert-status');
const certUploadLabel = document.getElementById('cert-upload-label');
const lockedSite = document.getElementById('locked-site');
const certSection = document.getElementById('cert-section');
const siteIntro = document.getElementById('site-intro');
const gamesHeading = document.getElementById('games-heading');
const gameCards = document.getElementById('game-cards');
const gamesLoading = document.getElementById('games-loading');
const gamesError = document.getElementById('games-error');
const warningBox = document.getElementById('warning-box');
const warningTitle = document.getElementById('warning-title');
const warningBody = document.getElementById('warning-body');
const proxyInstruction = document.getElementById('proxy-instruction');
const proxyInstructionDone = document.getElementById('proxy-instruction-done');
const proxyInstructionError = document.getElementById('proxy-instruction-error');
let proxyInstructionSeen = true;


function setText(el, value) {
  if (el && typeof value === 'string') el.textContent = value;
}
function makeElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (typeof text === 'string') el.textContent = text;
  return el;
}
async function loadProxyInstructionStatus() {
  if (!supabase || !currentUser?.id) return;
  // Default to showing the step if its status cannot be read.
  proxyInstructionSeen = false;
  try {
    const { data, error } = await supabase
      .from('user_onboarding')
      .select('instruction_key')
      .eq('user_id', currentUser.id)
      .eq('instruction_key', 'anyproxy-first-use')
      .maybeSingle();
    if (error) throw error;
    proxyInstructionSeen = !!data;
  } catch (err) {
    console.warn('Could not read one-time instruction status:', err);
  }
}

async function dismissProxyInstruction() {
  if (!supabase || !currentUser?.id || !proxyInstructionDone) return;
  proxyInstructionDone.disabled = true;
  if (proxyInstructionError) proxyInstructionError.hidden = true;
  try {
    const { error } = await supabase.from('user_onboarding').upsert({
      user_id: currentUser.id,
      instruction_key: 'anyproxy-first-use'
    }, { onConflict: 'user_id,instruction_key' });
    if (error) throw error;
    proxyInstructionSeen = true;
    if (proxyInstruction) proxyInstruction.hidden = true;
    setSiteUnlocked(true);
  } catch (err) {
    console.error('Could not save instruction status:', err);
    if (proxyInstructionError) {
      proxyInstructionError.textContent = 'Kunde inte spara ditt val. Kontrollera anslutningen och försök igen.';
      proxyInstructionError.hidden = false;
    }
  } finally {
    proxyInstructionDone.disabled = false;
  }
}

if (proxyInstructionDone) {
  proxyInstructionDone.addEventListener('click', dismissProxyInstruction);
}

async function loadSiteContent() {
  if (!supabase || !currentUser) return;
  if (gamesLoading) gamesLoading.hidden = false;
  if (gamesError) gamesError.hidden = true;
  try {
    const results = await Promise.all([
      supabase.from('site_content').select('content').eq('id', 1).maybeSingle(),
      supabase.from('game_catalog').select('id,title,description,emoji,launch_url,sort_order,enabled').eq('enabled', true).order('sort_order', { ascending: true })
    ]);
    const contentResult = results[0], gamesResult = results[1];
    if (contentResult.error) throw contentResult.error;
    if (gamesResult.error) throw gamesResult.error;
    const content = contentResult.data?.content || {};
    setText(siteIntro, content.site_intro || '');
    if (siteIntro) siteIntro.hidden = !content.site_intro;
    setText(gamesHeading, content.games_heading || 'Spelarkivet');
    setText(document.getElementById('cert-heading'), content.certificate_heading || 'CERTIFIKATVERIFIERING KRÄVS');
    setText(document.querySelector('.cert-eyebrow'), content.certificate_eyebrow || 'SÄKERHETSKONTROLL');
    setText(document.querySelector('.cert-hint'), content.certificate_hint || 'Identiteten måste verifieras innan du får åtkomst. Ladda upp ditt certifikat för att fortsätta.');
    setText(document.getElementById('admin-note'), content.admin_note || '🔒 Inget konto? Tala med administratörerna.');
    setText(document.getElementById('admin-note-small'), content.admin_note_small || 'Endast invigda har tillträde.');
    setText(warningTitle, content.warning_title || '⚠ VARNING FRÅN ADMINISTRATIONEN');
    setText(warningBody, content.warning_body || '');
    if (warningBox) warningBox.hidden = !content.warning_body;
    if (gameCards) {
      gameCards.replaceChildren();
      for (const game of (gamesResult.data || [])) {
        const card = makeElement('article', 'game-card');
        card.dataset.game = game.id;
        const thumb = makeElement('div', 'game-thumb', game.emoji || '🎮');
        const info = makeElement('div', 'game-info');
        info.append(makeElement('h4', '', game.title || 'Spel'));
        info.append(makeElement('p', '', game.description || ''));
        if (game.launch_url) {
          const link = makeElement('a', 'btn-play', 'Spela');
          link.href = game.launch_url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          info.append(link);
        } else {
          const button = makeElement('button', 'btn-play', 'Spela');
          button.type = 'button';
          button.addEventListener('click', () => openGame(game.id));
          info.append(button);
        }
        card.append(thumb, info);
        gameCards.append(card);
      }
    }
    if (gamesLoading) gamesLoading.hidden = true;
  } catch (err) {
    console.error('Supabase content load failed:', err);
    if (gamesLoading) gamesLoading.hidden = true;
    if (gamesError) {
      gamesError.textContent = 'Kunde inte ladda innehållet från Supabase. Kontrollera att migrationen och RLS-policyerna är installerade.';
      gamesError.hidden = false;
    }
  }
}


let supabase = null;
let currentUser = null;
let currentProfile = null;
let isVerified = false;

function showError(msg) {
  loginError.textContent = msg;
  loginError.hidden = false;
  loginBtn.disabled = false;
  loginBtn.querySelector('span').textContent = 'LOGGA IN';
}

// ---------- Init Supabase safely ----------
function initSupabase() {
  if (!window.supabase || !window.supabase.createClient) {
    showError('Kunde inte ladda Supabase. Kolla nätverket / blockering av CDN.');
    console.error('window.supabase is missing. CDN script failed to load.');
    return false;
  }
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        // Never persist a login between page loads or browser sessions.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    return true;
  } catch (err) {
    showError('Supabase-init fel: ' + err.message);
    console.error(err);
    return false;
  }
}

// ---------- Auth ----------
async function checkSession() {
  if (!supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      showDashboard(session.user);
    } else {
      showLogin();
    }
  } catch (err) {
    console.error('checkSession error:', err);
    showLogin();
  }
}

function setSiteUnlocked(unlocked) {
  isVerified = !!unlocked;
  const needsProxySetup = !!unlocked && !proxyInstructionSeen;
  if (lockedSite) lockedSite.hidden = !unlocked;
  if (certSection) certSection.hidden = !!unlocked;
  if (proxyInstruction) proxyInstruction.hidden = !unlocked || proxyInstructionSeen;
  if (dashboardScreen) dashboardScreen.classList.toggle("proxy-gate", needsProxySetup);
}

function showLogin() {
  loginScreen.classList.add('active');
  dashboardScreen.classList.remove('active');
  dashboardScreen.hidden = true;
  dashboardScreen.setAttribute('aria-hidden', 'true');
  currentUser = null;
  currentProfile = null;
  setSiteUnlocked(false);
  if (certFileInput) certFileInput.value = '';
  if (certStatus) {
    certStatus.hidden = true;
    certStatus.textContent = '';
    certStatus.className = 'cert-status';
  }
  if (certUploadLabel) certUploadLabel.textContent = 'Ladda upp';
}

// Certificate verification is intentionally memory-only.
// It must be uploaded and verified again after each login/page load.

function displayNameFromUser(user, profile) {
  if (profile?.full_name) return profile.full_name;
  const meta = user?.user_metadata || {};
  return meta.full_name || meta.name || meta.namn || null;
}

function setWelcome(name) {
  if (!welcomeTitle) return;
  welcomeTitle.textContent = name ? ('Välkommen ' + name + '!') : 'Välkommen!';
}

function applyCertToUI(cert) {
  const baseName = displayNameFromUser(currentUser, currentProfile);
  if (cert && cert.verified) {
    setWelcome(cert.namn || baseName);
    setSiteUnlocked(true);
  } else {
    setWelcome(baseName);
    setSiteUnlocked(false);
  }
}

async function loadProfile(user) {
  currentProfile = null;
  if (!supabase || !user?.id) return null;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, certificate_key, role')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.warn('profiles load:', error.message);
      return null;
    }
    currentProfile = data;
    return data;
  } catch (err) {
    console.warn('profiles load failed', err);
    return null;
  }
}

function parseCertificate(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const fields = {};
  let key = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) {
      const body = trimmed.replace(/^#\s*/, '');
      const colon = body.indexOf(':');
      if (colon === -1) continue;
      const k = body.slice(0, colon).trim().toLowerCase();
      const v = body.slice(colon + 1).trim();
      if (k && v) fields[k] = v;
    } else {
      key = trimmed;
    }
  }

  const namn = fields.namn || fields.name || fields['full name'] || fields.fullname || null;
  if (!namn) {
    return { ok: false, error: 'Certifikatet saknar # namn: …' };
  }
  if (!key || key.length < 6) {
    return { ok: false, error: 'Certifikatet saknar en giltig nyckel (minst 6 tecken på sista raden).' };
  }

  return {
    ok: true,
    data: {
      namn,
      födelsedatum: fields.födelsedatum || fields['date of birth'] || fields.dob || null,
      klass: fields.klass || fields.class || null,
      key,
      fields
    }
  };
}

function verifyCertAgainstProfile(parsed) {
  if (!currentProfile || !(currentProfile.certificate_key || '').trim()) {
    return { ok: false, error: 'Ogiltigt certifikat.' };
  }
  if (parsed.key.trim() !== currentProfile.certificate_key.trim()) {
    return { ok: false, error: 'Ogiltigt certifikat.' };
  }
  return {
    ok: true,
    data: {
      ...parsed,
      namn: currentProfile.full_name || parsed.namn,
      verified: true
    }
  };
}

async function showDashboard(user) {
  if (!user?.id) { showLogin(); return; }
  currentUser = user;
  loginScreen.classList.remove('active');
  dashboardScreen.hidden = false;
  dashboardScreen.setAttribute('aria-hidden', 'false');
  dashboardScreen.classList.add('active');
  userEmailEl.textContent = user.email || user.id;
  setSiteUnlocked(false);
  await loadProfile(user);
  await loadProxyInstructionStatus();
  await loadSiteContent();
  setWelcome(displayNameFromUser(user, currentProfile));
  // Never restore a previous certificate verification.
  applyCertToUI(null);
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  e.stopPropagation();

  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.querySelector('span').textContent = 'LOGGAR IN...';

  if (!supabase) {
    showError('Supabase är inte redo. Ladda om sidan.');
    return;
  }

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showError('Fyll i både e-post och lösenord.');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('Login error:', error);
      let msg = error.message;
      if (msg === 'Invalid login credentials') {
        msg = 'Felaktig e-post eller lösenord.';
      } else if (msg.includes('Email not confirmed')) {
        msg = 'E-postadressen är inte bekräftad. Stäng av "Confirm email" i Supabase.';
      } else if (msg.includes('signups not allowed') || msg.includes('Signup is disabled')) {
        msg = 'Registrering är avstängd (bra). Använd ett konto skapat av admin.';
      }
      showError('Fel: ' + msg);
      return;
    }

    if (data?.user) {
      showDashboard(data.user);
    } else {
      showError('Inloggning lyckades men ingen användare returnerades.');
    }
  } catch (err) {
    console.error('Unexpected login error:', err);
    showError('Nätverksfel eller oväntat fel: ' + (err.message || err));
  } finally {
    loginBtn.disabled = false;
    loginBtn.querySelector('span').textContent = 'LOGGA IN';
  }
});

logoutBtn.addEventListener('click', async () => {
  if (supabase) {
    await supabase.auth.signOut();
  }
  showLogin();
  loginForm.reset();
});

if (certFileInput) {
  certFileInput.addEventListener('change', async () => {
    const file = certFileInput.files && certFileInput.files[0];
    if (!file) return;
    if (!currentUser) {
      certStatus.hidden = false;
      certStatus.className = 'cert-status bad';
      certStatus.textContent = 'Du måste vara inloggad.';
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCertificate(text);
      if (!parsed.ok) {
        certStatus.hidden = false;
        certStatus.className = 'cert-status bad';
        certStatus.textContent = 'Ogiltigt certifikat.';
        setSiteUnlocked(false);
        return;
      }
      if (!currentProfile) await loadProfile(currentUser);
      const checked = verifyCertAgainstProfile(parsed.data);
      if (!checked.ok) {
        certStatus.hidden = false;
        certStatus.className = 'cert-status bad';
        certStatus.textContent = 'Ogiltigt certifikat.';
        setSiteUnlocked(false);
        return;
      }
      applyCertToUI(checked.data);
    } catch (err) {
      certStatus.hidden = false;
      certStatus.className = 'cert-status bad';
      certStatus.textContent = 'Ogiltigt certifikat.';
      setSiteUnlocked(false);
      console.error(err);
    }
  });
}

// ---------- Boot ----------
if (initSupabase()) {
  // Listen for auth changes
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      showLogin();
    } else if (event === 'SIGNED_IN' && session) {
      showDashboard(session.user);
    }
  });

  checkSession();
} else {
  // Keep the login form visible so the error is seen
  showLogin();
}

// ---------- Game Modal ----------
closeGameBtn.addEventListener('click', () => {
  stopCurrentGame();
  gameModal.hidden = true;
  gameContainer.innerHTML = '';
});

let currentGameCleanup = null;

function stopCurrentGame() {
  if (currentGameCleanup) {
    currentGameCleanup();
    currentGameCleanup = null;
  }
}

function openGame(gameId) {
  if (!currentUser || dashboardScreen.hidden || !isVerified) return;
  stopCurrentGame();
  gameContainer.innerHTML = '';
  gameModal.hidden = false;

  const titles = {
    snake: 'Ormen',
    tetris: 'Tetris',
    '2048': '2048',
    flappy: 'Flappy Bird',
    pong: 'Pong',
    minesweeper: 'Minesweeper'
  };
  gameTitle.textContent = titles[gameId] || 'Spel';

  switch (gameId) {
    case 'snake':
      currentGameCleanup = startSnake();
      break;
    case 'tetris':
      currentGameCleanup = startTetris();
      break;
    case '2048':
      currentGameCleanup = start2048();
      break;
    case 'flappy':
      currentGameCleanup = startFlappy();
      break;
    case 'pong':
      currentGameCleanup = startPong();
      break;
    case 'minesweeper':
      currentGameCleanup = startMinesweeper();
      break;
  }
}

// ==================== SIMPLE GAMES ====================

function startSnake() {
  const wrap = document.createElement('div');
  wrap.className = 'game-canvas-wrap';
  wrap.innerHTML = `
    <div class="score-display">Poäng: <span id="snake-score">0</span></div>
    <canvas id="snake-canvas" width="320" height="320"></canvas>
    <div class="game-controls">Piltangenter eller WASD för att styra</div>
  `;
  gameContainer.appendChild(wrap);

  const canvas = document.getElementById('snake-canvas');
  const ctx = canvas.getContext('2d');
  const grid = 16;
  const size = 20;
  let snake = [{ x: 10, y: 10 }];
  let dir = { x: 1, y: 0 };
  let food = { x: 15, y: 15 };
  let score = 0;
  let gameOver = false;
  let interval;

  function placeFood() {
    food = {
      x: Math.floor(Math.random() * size),
      y: Math.floor(Math.random() * size)
    };
  }

  function draw() {
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, 320, 320);

    // food
    ctx.fillStyle = '#ff2a6d';
    ctx.fillRect(food.x * grid, food.y * grid, grid - 1, grid - 1);

    // snake
    ctx.fillStyle = '#05d9e8';
    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#00ff9f' : '#05d9e8';
      ctx.fillRect(s.x * grid, s.y * grid, grid - 1, grid - 1);
    });
  }

  function update() {
    if (gameOver) return;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    if (head.x < 0 || head.x >= size || head.y < 0 || head.y >= size ||
        snake.some(s => s.x === head.x && s.y === head.y)) {
      gameOver = true;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, 320, 320);
      ctx.fillStyle = '#ff2a6d';
      ctx.font = '20px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', 160, 150);
      ctx.fillText('Poäng: ' + score, 160, 180);
      return;
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      document.getElementById('snake-score').textContent = score;
      placeFood();
    } else {
      snake.pop();
    }
    draw();
  }

  function onKey(e) {
    const key = e.key.toLowerCase();
    if ((key === 'arrowup' || key === 'w') && dir.y === 0) dir = { x: 0, y: -1 };
    if ((key === 'arrowdown' || key === 's') && dir.y === 0) dir = { x: 0, y: 1 };
    if ((key === 'arrowleft' || key === 'a') && dir.x === 0) dir = { x: -1, y: 0 };
    if ((key === 'arrowright' || key === 'd') && dir.x === 0) dir = { x: 1, y: 0 };
  }

  document.addEventListener('keydown', onKey);
  draw();
  interval = setInterval(update, 110);

  return () => {
    clearInterval(interval);
    document.removeEventListener('keydown', onKey);
  };
}

function startTetris() {
  const wrap = document.createElement('div');
  wrap.className = 'game-canvas-wrap';
  wrap.innerHTML = `
    <div class="score-display">Poäng: <span id="tetris-score">0</span></div>
    <canvas id="tetris-canvas" width="200" height="400"></canvas>
    <div class="game-controls">← → flytta | ↑ rotera | ↓ fall</div>
  `;
  gameContainer.appendChild(wrap);

  const canvas = document.getElementById('tetris-canvas');
  const ctx = canvas.getContext('2d');
  const COLS = 10, ROWS = 20, BLOCK = 20;
  const COLORS = ['#05d9e8', '#ff2a6d', '#d300c5', '#00ff9f', '#ffaa00', '#00aaff', '#ff5500'];

  const SHAPES = [
    [[1,1,1,1]],
    [[1,1],[1,1]],
    [[0,1,0],[1,1,1]],
    [[1,0,0],[1,1,1]],
    [[0,0,1],[1,1,1]],
    [[1,1,0],[0,1,1]],
    [[0,1,1],[1,1,0]]
  ];

  let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  let piece = null;
  let score = 0;
  let gameOver = false;
  let interval;

  function newPiece() {
    const type = Math.floor(Math.random() * SHAPES.length);
    piece = {
      shape: SHAPES[type].map(r => [...r]),
      x: 3,
      y: 0,
      color: COLORS[type]
    };
    if (collision()) gameOver = true;
  }

  function collision() {
    for (let y = 0; y < piece.shape.length; y++) {
      for (let x = 0; x < piece.shape[y].length; x++) {
        if (piece.shape[y][x]) {
          const nx = piece.x + x, ny = piece.y + y;
          if (nx < 0 || nx >= COLS || ny >= ROWS || (ny >= 0 && board[ny][nx])) return true;
        }
      }
    }
    return false;
  }

  function merge() {
    piece.shape.forEach((row, y) => {
      row.forEach((val, x) => {
        if (val && piece.y + y >= 0) board[piece.y + y][piece.x + x] = piece.color;
      });
    });
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(c => c)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++;
        y++;
      }
    }
    score += cleared * 100;
    document.getElementById('tetris-score').textContent = score;
  }

  function rotate() {
    const rotated = piece.shape[0].map((_, i) => piece.shape.map(r => r[i]).reverse());
    const old = piece.shape;
    piece.shape = rotated;
    if (collision()) piece.shape = old;
  }

  function draw() {
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, 200, 400);

    board.forEach((row, y) => {
      row.forEach((c, x) => {
        if (c) {
          ctx.fillStyle = c;
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK - 1, BLOCK - 1);
        }
      });
    });

    if (piece) {
      ctx.fillStyle = piece.color;
      piece.shape.forEach((row, y) => {
        row.forEach((val, x) => {
          if (val) ctx.fillRect((piece.x + x) * BLOCK, (piece.y + y) * BLOCK, BLOCK - 1, BLOCK - 1);
        });
      });
    }

    if (gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, 200, 400);
      ctx.fillStyle = '#ff2a6d';
      ctx.font = '18px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', 100, 190);
    }
  }

  function drop() {
    if (gameOver) return;
    piece.y++;
    if (collision()) {
      piece.y--;
      merge();
      clearLines();
      newPiece();
    }
    draw();
  }

  function onKey(e) {
    if (gameOver) return;
    if (e.key === 'ArrowLeft') { piece.x--; if (collision()) piece.x++; }
    if (e.key === 'ArrowRight') { piece.x++; if (collision()) piece.x--; }
    if (e.key === 'ArrowDown') drop();
    if (e.key === 'ArrowUp') rotate();
    draw();
  }

  newPiece();
  draw();
  interval = setInterval(drop, 500);
  document.addEventListener('keydown', onKey);

  return () => {
    clearInterval(interval);
    document.removeEventListener('keydown', onKey);
  };
}

function start2048() {
  const wrap = document.createElement('div');
  wrap.className = 'game-canvas-wrap';
  wrap.innerHTML = `
    <div class="score-display">Poäng: <span id="score-2048">0</span></div>
    <div id="grid-2048" style="display:grid;grid-template-columns:repeat(4,70px);gap:8px;justify-content:center;"></div>
    <div class="game-controls">Piltangenter för att flytta brickorna</div>
  `;
  gameContainer.appendChild(wrap);

  const gridEl = document.getElementById('grid-2048');
  let grid = Array.from({ length: 4 }, () => Array(4).fill(0));
  let score = 0;

  function addTile() {
    const empty = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!grid[r][c]) empty.push([r, c]);
    if (empty.length) {
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    }
  }

  function render() {
    gridEl.innerHTML = '';
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const cell = document.createElement('div');
        const val = grid[r][c];
        cell.style.cssText = `
          width:70px;height:70px;display:flex;align-items:center;justify-content:center;
          font-family:Orbitron;font-weight:700;font-size:${val > 1000 ? 16 : 22}px;
          border-radius:6px;background:${val ? '#1a1a2e' : '#12121a'};
          color:${val ? '#05d9e8' : '#333'};border:1px solid #2a2a3a;
        `;
        cell.textContent = val || '';
        gridEl.appendChild(cell);
      }
    }
    document.getElementById('score-2048').textContent = score;
  }

  function slide(row) {
    let arr = row.filter(x => x);
    for (let i = 0; i < arr.length - 1; i++) {
      if (arr[i] === arr[i + 1]) {
        arr[i] *= 2;
        score += arr[i];
        arr[i + 1] = 0;
      }
    }
    arr = arr.filter(x => x);
    while (arr.length < 4) arr.push(0);
    return arr;
  }

  function move(dir) {
    const old = JSON.stringify(grid);
    if (dir === 'left') grid = grid.map(r => slide(r));
    if (dir === 'right') grid = grid.map(r => slide(r.reverse()).reverse());
    if (dir === 'up') {
      for (let c = 0; c < 4; c++) {
        let col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]];
        col = slide(col);
        for (let r = 0; r < 4; r++) grid[r][c] = col[r];
      }
    }
    if (dir === 'down') {
      for (let c = 0; c < 4; c++) {
        let col = [grid[0][c], grid[1][c], grid[2][c], grid[3][c]].reverse();
        col = slide(col).reverse();
        for (let r = 0; r < 4; r++) grid[r][c] = col[r];
      }
    }
    if (JSON.stringify(grid) !== old) {
      addTile();
      render();
    }
  }

  function onKey(e) {
    if (e.key === 'ArrowLeft') move('left');
    if (e.key === 'ArrowRight') move('right');
    if (e.key === 'ArrowUp') move('up');
    if (e.key === 'ArrowDown') move('down');
  }

  addTile();
  addTile();
  render();
  document.addEventListener('keydown', onKey);

  return () => document.removeEventListener('keydown', onKey);
}

function startFlappy() {
  const wrap = document.createElement('div');
  wrap.className = 'game-canvas-wrap';
  wrap.innerHTML = `
    <div class="score-display">Poäng: <span id="flappy-score">0</span></div>
    <canvas id="flappy-canvas" width="320" height="400"></canvas>
    <div class="game-controls">Mellanslag eller klick för att flyga</div>
  `;
  gameContainer.appendChild(wrap);

  const canvas = document.getElementById('flappy-canvas');
  const ctx = canvas.getContext('2d');
  let birdY = 200, vel = 0, pipes = [], score = 0, frame = 0, alive = true;
  let interval;

  function reset() {
    birdY = 200; vel = 0; pipes = []; score = 0; frame = 0; alive = true;
  }

  function draw() {
    ctx.fillStyle = '#0a1a2f';
    ctx.fillRect(0, 0, 320, 400);

    // pipes
    ctx.fillStyle = '#00ff9f';
    pipes.forEach(p => {
      ctx.fillRect(p.x, 0, 40, p.top);
      ctx.fillRect(p.x, p.top + 100, 40, 400 - p.top - 100);
    });

    // bird
    ctx.fillStyle = '#ff2a6d';
    ctx.beginPath();
    ctx.arc(80, birdY, 12, 0, Math.PI * 2);
    ctx.fill();

    if (!alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, 320, 400);
      ctx.fillStyle = '#ff2a6d';
      ctx.font = '20px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', 160, 180);
      ctx.fillText('Poäng: ' + score, 160, 210);
    }
  }

  function update() {
    if (!alive) return;
    frame++;
    vel += 0.4;
    birdY += vel;

    if (frame % 90 === 0) {
      pipes.push({ x: 320, top: 50 + Math.random() * 150 });
    }

    pipes.forEach(p => p.x -= 2);
    pipes = pipes.filter(p => p.x > -40);

    // collision
    if (birdY > 388 || birdY < 12) alive = false;
    pipes.forEach(p => {
      if (80 + 12 > p.x && 80 - 12 < p.x + 40) {
        if (birdY - 12 < p.top || birdY + 12 > p.top + 100) alive = false;
      }
      if (p.x + 40 === 80) {
        score++;
        document.getElementById('flappy-score').textContent = score;
      }
    });

    draw();
  }

  function flap() {
    if (!alive) { reset(); return; }
    vel = -7;
  }

  function onKey(e) { if (e.code === 'Space') { e.preventDefault(); flap(); } }
  canvas.addEventListener('click', flap);
  document.addEventListener('keydown', onKey);

  interval = setInterval(update, 20);

  return () => {
    clearInterval(interval);
    document.removeEventListener('keydown', onKey);
  };
}

function startPong() {
  const wrap = document.createElement('div');
  wrap.className = 'game-canvas-wrap';
  wrap.innerHTML = `
    <div class="score-display"><span id="pong-score">0</span> — <span id="pong-ai">0</span></div>
    <canvas id="pong-canvas" width="400" height="280"></canvas>
    <div class="game-controls">Mus eller piltangenter för din paddel</div>
  `;
  gameContainer.appendChild(wrap);

  const canvas = document.getElementById('pong-canvas');
  const ctx = canvas.getContext('2d');
  let playerY = 110, aiY = 110, ball = { x: 200, y: 140, vx: 3, vy: 2 };
  let pScore = 0, aScore = 0;
  let interval;

  function draw() {
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, 400, 280);
    ctx.strokeStyle = '#2a2a3a';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(200, 0);
    ctx.lineTo(200, 280);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#05d9e8';
    ctx.fillRect(10, playerY, 8, 60);
    ctx.fillStyle = '#ff2a6d';
    ctx.fillRect(382, aiY, 8, 60);

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#00ff9f';
    ctx.fill();
  }

  function update() {
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y < 7 || ball.y > 273) ball.vy *= -1;

    // player paddle
    if (ball.x < 25 && ball.y > playerY && ball.y < playerY + 60) {
      ball.vx = Math.abs(ball.vx) * 1.05;
      ball.vy += (ball.y - (playerY + 30)) * 0.1;
    }
    // ai paddle
    if (ball.x > 375 && ball.y > aiY && ball.y < aiY + 60) {
      ball.vx = -Math.abs(ball.vx) * 1.05;
    }

    // score
    if (ball.x < 0) { aScore++; document.getElementById('pong-ai').textContent = aScore; ball = { x: 200, y: 140, vx: 3, vy: 2 }; }
    if (ball.x > 400) { pScore++; document.getElementById('pong-score').textContent = pScore; ball = { x: 200, y: 140, vx: -3, vy: 2 }; }

    // simple AI
    const target = ball.y - 30;
    aiY += (target - aiY) * 0.08;
    aiY = Math.max(0, Math.min(220, aiY));

    draw();
  }

  function onMove(e) {
    const rect = canvas.getBoundingClientRect();
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    playerY = Math.max(0, Math.min(220, y - 30));
  }

  function onKey(e) {
    if (e.key === 'ArrowUp') playerY = Math.max(0, playerY - 20);
    if (e.key === 'ArrowDown') playerY = Math.min(220, playerY + 20);
  }

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('touchmove', onMove);
  document.addEventListener('keydown', onKey);
  interval = setInterval(update, 16);

  return () => {
    clearInterval(interval);
    document.removeEventListener('keydown', onKey);
  };
}

function startMinesweeper() {
  const wrap = document.createElement('div');
  wrap.className = 'game-canvas-wrap';
  wrap.innerHTML = `
    <div class="score-display">Minor kvar: <span id="mine-count">10</span></div>
    <div id="mine-grid" style="display:grid;grid-template-columns:repeat(9,32px);gap:2px;justify-content:center;"></div>
    <div class="game-controls">Vänsterklick = öppna | Högerklick = flagga</div>
  `;
  gameContainer.appendChild(wrap);

  const ROWS = 9, COLS = 9, MINES = 10;
  let board = [], revealed = [], flagged = [], gameOver = false;
  const gridEl = document.getElementById('mine-grid');

  function init() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    revealed = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    flagged = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    gameOver = false;

    // place mines
    let placed = 0;
    while (placed < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);
      if (board[r][c] !== -1) {
        board[r][c] = -1;
        placed++;
      }
    }

    // numbers
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] === -1) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc] === -1) count++;
          }
        }
        board[r][c] = count;
      }
    }
    render();
  }

  function reveal(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS || revealed[r][c] || flagged[r][c] || gameOver) return;
    revealed[r][c] = true;
    if (board[r][c] === -1) {
      gameOver = true;
      // reveal all mines
      for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) if (board[i][j] === -1) revealed[i][j] = true;
      alert('💣 Boom! Du förlorade.');
      return;
    }
    if (board[r][c] === 0) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) reveal(r + dr, c + dc);
    }
  }

  function render() {
    gridEl.innerHTML = '';
    let flags = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (flagged[r][c]) flags++;
        const cell = document.createElement('div');
        cell.style.cssText = `
          width:32px;height:32px;display:flex;align-items:center;justify-content:center;
          font-size:14px;font-weight:bold;border-radius:3px;cursor:pointer;
          background:${revealed[r][c] ? '#1a1a2e' : '#2a2a3a'};
          color:${['','#05d9e8','#00ff9f','#ffaa00','#ff2a6d','#d300c5','#ff5500','#aaa','#fff'][board[r][c]] || '#fff'};
          border:1px solid #3a3a4a;
        `;
        if (revealed[r][c]) {
          if (board[r][c] === -1) cell.textContent = '💣';
          else if (board[r][c] > 0) cell.textContent = board[r][c];
        } else if (flagged[r][c]) {
          cell.textContent = '🚩';
        }

        cell.addEventListener('click', () => {
          if (!gameOver) { reveal(r, c); render(); checkWin(); }
        });
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!revealed[r][c] && !gameOver) {
            flagged[r][c] = !flagged[r][c];
            render();
          }
        });
        gridEl.appendChild(cell);
      }
    }
    document.getElementById('mine-count').textContent = MINES - flags;
  }

  function checkWin() {
    let safe = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (revealed[r][c] && board[r][c] !== -1) safe++;
    if (safe === ROWS * COLS - MINES) {
      gameOver = true;
      alert('🎉 Du vann!');
    }
  }

  init();
  return () => {};
}
