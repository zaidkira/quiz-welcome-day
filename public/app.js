/* ===================================================
   WF CLUB - OPEN DAY QUIZ PLATFORM
   Client Application Logic & Realtime Sync Engine
   =================================================== */

// Global App State
const state = {
  status: 'not_started', // 'not_started' | 'active' | 'ended'
  startedAt: null,
  endedAt: null,
  timePerQuestion: 20,
  questions: [],
  leaderboard: [],
  totalParticipants: 0,

  // Local Participant State
  player: {
    registered: false,
    started: false,
    name: '',
    avatar: '🚀',
    currentQIndex: 0,
    answers: [], // selected option index for each question
    questionStartTimes: [],
    questionDurations: [],
    score: 0,
    totalTimeSec: 0,
    completed: false,
    detailedResults: null
  },

  // Admin State
  admin: {
    isLoggedIn: false,
    password: '',
    questionsCache: []
  },

  // Audio & Settings
  audioEnabled: true,
  currentView: 'quiz',
  timerInterval: null,
  timeLeft: 20
};

// ===================================================
// 1. AUDIO SYNTHESIS ENGINE (Web Audio API)
// ===================================================
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.15) {
  if (!state.audioEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Audio context not allowed or failed
  }
}

const SoundFX = {
  click: () => playTone(600, 'sine', 0.08, 0.1),
  tick: () => playTone(800, 'sine', 0.04, 0.05),
  urgentTick: () => playTone(1200, 'triangle', 0.08, 0.15),
  select: () => {
    playTone(520, 'sine', 0.08, 0.15);
    setTimeout(() => playTone(780, 'sine', 0.1, 0.12), 70);
  },
  correct: () => {
    playTone(523.25, 'triangle', 0.12, 0.2); // C5
    setTimeout(() => playTone(659.25, 'triangle', 0.12, 0.2), 100); // E5
    setTimeout(() => playTone(783.99, 'triangle', 0.25, 0.25), 200); // G5
  },
  wrong: () => {
    playTone(280, 'sawtooth', 0.2, 0.15);
    setTimeout(() => playTone(220, 'sawtooth', 0.25, 0.15), 120);
  },
  fanfare: () => {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'triangle', 0.25, 0.2), idx * 120);
    });
  }
};

function toggleAudio() {
  state.audioEnabled = !state.audioEnabled;
  const btn = document.getElementById('sfx-toggle-btn');
  if (btn) {
    btn.textContent = state.audioEnabled ? '🔊' : '🔇';
    btn.title = state.audioEnabled ? 'Sound Effects Enabled' : 'Sound Effects Muted';
  }
  showToast(state.audioEnabled ? 'Sound Effects Enabled' : 'Sound Effects Muted');
}

// ===================================================
// 2. CONFETTI CANVAS ENGINE
// ===================================================
const confetti = {
  canvas: null,
  ctx: null,
  particles: [],
  animId: null,

  init() {
    this.canvas = document.getElementById('confetti-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  burst(count = 120) {
    if (!this.canvas) this.init();
    const colors = ['#00d2ff', '#0072ff', '#38bdf8', '#fbbf24', '#f43f5e', '#10b981', '#a855f7'];

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: window.innerWidth / 2 + (Math.random() * 200 - 100),
        y: window.innerHeight * 0.4,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.7) * 18,
        size: Math.random() * 8 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1
      });
    }

    if (!this.animId) {
      this.loop();
    }
  },

  loop() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.vx *= 0.99; // drag
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.007;

      if (p.opacity <= 0 || p.y > window.innerHeight) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0, p.opacity);
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animId = requestAnimationFrame(() => this.loop());
    } else {
      this.animId = null;
    }
  }
};

// ===================================================
// 3. TOAST NOTIFICATIONS
// ===================================================
function showToast(message, icon = 'ℹ️') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// ===================================================
// 4. WEBSOCKET & SERVER SYNCHRONIZATION
// ===================================================
let ws = null;
let reconnectTimer = null;

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WS] Connected to live quiz server.');
      clearTimeout(reconnectTimer);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error('[WS] Error processing message:', err);
      }
    };

    ws.onclose = () => {
      console.warn('[WS] Connection closed. Attempting reconnect in 3s...');
      reconnectTimer = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.warn('[WS] WebSocket error:', err);
      ws.close();
    };
  } catch (e) {
    console.warn('[WS] Failed to create WebSocket, falling back to REST polling.');
  }
}

function sendWs(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'INIT_STATE':
      updateFullState(msg.state);
      if (msg.localIp && msg.port) {
        setupBoardQR(msg.localIp, msg.port);
      }
      break;

    case 'QUIZ_STATUS_CHANGED':
      state.status = msg.status;
      state.startedAt = msg.startedAt || null;
      state.endedAt = msg.endedAt || null;
      renderQuizStatusBadge();
      handleStatusChangeReaction();
      break;

    case 'LEADERBOARD_UPDATE':
      const prevTopId = state.leaderboard[0]?.id;
      state.leaderboard = msg.leaderboard || [];
      renderLeaderboard();
      renderAdminDashboard();

      // If a new player just claimed 1st place!
      const newTop = state.leaderboard[0];
      if (newTop && newTop.id !== prevTopId && state.leaderboard.length > 0) {
        SoundFX.fanfare();
        confetti.burst(80);
        showToast(`👑 ${newTop.name} took 1st Place with ${newTop.score} pts!`, '🏆');
      }
      break;

    case 'QUESTIONS_UPDATED':
      state.questions = msg.questions;
      renderQuestionsCount();
      break;

    case 'PARTICIPANT_COUNT':
      state.totalParticipants = msg.count;
      updateParticipantCountDisplay();
      break;

    case 'ADMIN_ACTION_SUCCESS':
      showToast(`Admin action executed: ${msg.action}`, '✅');
      refreshAdminData();
      break;

    case 'ERROR':
      showToast(msg.message, '⚠️');
      break;
  }
}

function updateFullState(serverState) {
  if (!serverState) return;
  state.status = serverState.status;
  state.startedAt = serverState.startedAt;
  state.endedAt = serverState.endedAt;
  state.timePerQuestion = serverState.timePerQuestion || 20;

  // Don't overwrite questions list while player is answering
  if (!state.player.started || state.questions.length === 0) {
    if (serverState.questions && serverState.questions.length > 0) {
      state.questions = serverState.questions;
    }
  }

  state.leaderboard = serverState.leaderboard || [];
  state.totalParticipants = serverState.totalParticipants || 0;

  renderQuizStatusBadge();
  renderLeaderboard();
  renderQuestionsCount();
  updateParticipantCountDisplay();
  handleStatusChangeReaction();
}

// Fetch State via REST API fallback
async function fetchStateREST() {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const data = await res.json();
      updateFullState(data);
    }
  } catch (err) {
    console.error('[REST] Failed to fetch state:', err);
  }
}

// Setup QR Code on Live Leaderboard Banner
async function setupBoardQR(localIp, port) {
  try {
    const res = await fetch('/api/qr');
    if (res.ok) {
      const data = await res.json();
      const qrImg = document.getElementById('board-qr-img');
      const joinUrlSpan = document.getElementById('board-join-url');
      if (qrImg && data.qrDataUrl) {
        qrImg.src = data.qrDataUrl;
        qrImg.style.display = 'block';
      }
      if (joinUrlSpan) {
        joinUrlSpan.textContent = data.url;
      }
    }
  } catch (e) {
    // QR code load optional
  }
}

// ===================================================
// 5. VIEW NAVIGATION & UI SWITCHER
// ===================================================
function switchView(viewName) {
  SoundFX.click();
  state.currentView = viewName;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

  const tabBtn = document.getElementById(`tab-${viewName}`);
  const section = document.getElementById(`view-${viewName}`);

  if (tabBtn) tabBtn.classList.add('active');
  if (section) section.classList.add('active');

  if (viewName === 'board') {
    renderLeaderboard();
  } else if (viewName === 'admin') {
    if (state.admin.isLoggedIn) {
      refreshAdminData();
    }
  }
}

function toggleFullscreen() {
  SoundFX.click();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

function renderQuizStatusBadge() {
  const pill = document.getElementById('quiz-status-pill');
  const text = document.getElementById('quiz-status-text');
  if (!pill || !text) return;

  pill.className = `status-badge ${state.status}`;
  switch (state.status) {
    case 'not_started':
      text.textContent = 'STANDBY';
      break;
    case 'active':
      text.textContent = 'LIVE ROUND';
      break;
    case 'ended':
      text.textContent = 'ROUND ENDED';
      break;
  }
}

function updateParticipantCountDisplay() {
  const countEl = document.getElementById('board-participant-count');
  if (countEl) {
    countEl.textContent = `👥 ${state.leaderboard.length} Completed (${state.totalParticipants} Joined)`;
  }
}

function renderQuestionsCount() {
  const totalCountEl = document.getElementById('q-total-count');
  if (totalCountEl) {
    totalCountEl.textContent = state.questions.length || 10;
  }
}

// React to quiz status transitions (e.g. admin starts quiz)
function handleStatusChangeReaction() {
  // Only trigger starting questions if player registered, was in waiting room, and hasn't started yet!
  if (state.player.registered && !state.player.started && !state.player.completed) {
    if (state.status === 'active') {
      startParticipantQuizQuestions();
    } else if (state.status === 'not_started') {
      showQuizSubscreen('waiting');
    }
  } else if (state.player.registered && state.status === 'ended' && !state.player.completed) {
    showToast('The Admin has closed this quiz session.', '🛑');
  }
}

// Show internal screen inside Participant Quiz view
function showQuizSubscreen(screenName) {
  const screens = ['join', 'waiting', 'active', 'result'];
  screens.forEach(s => {
    const el = document.getElementById(`quiz-screen-${s}`);
    if (el) el.style.display = s === screenName ? 'block' : 'none';
  });
}

// ===================================================
// 6. PARTICIPANT QUIZ FLOW
// ===================================================

// Avatar picker interaction
document.querySelectorAll('.avatar-option').forEach(option => {
  option.addEventListener('click', () => {
    SoundFX.click();
    document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');
    state.player.avatar = option.dataset.avatar;
  });
});

function handleJoinQuiz(e) {
  e.preventDefault();
  initAudio();
  SoundFX.click();

  const nameInput = document.getElementById('player-name-input');
  const name = nameInput.value.trim();
  if (!name) return;

  state.player.name = name;
  state.player.registered = true;
  state.player.started = false;
  state.player.answers = [];
  state.player.questionStartTimes = [];
  state.player.questionDurations = [];
  state.player.score = 0;
  state.player.currentQIndex = 0;
  state.player.completed = false;

  // Notify server of join
  sendWs({
    type: 'PARTICIPANT_JOIN',
    name: state.player.name,
    avatar: state.player.avatar
  });

  const waitingName = document.getElementById('waiting-player-name');
  if (waitingName) waitingName.textContent = state.player.name;

  if (state.status === 'active') {
    startParticipantQuizQuestions();
  } else {
    showQuizSubscreen('waiting');
  }
}

function startParticipantQuizQuestions() {
  if (state.player.started) return; // Prevent resetting while actively answering!
  state.player.started = true;
  showQuizSubscreen('active');
  state.player.currentQIndex = 0;
  state.player.answers = [];
  state.player.score = 0;
  state.player.questionStartTimes = [];
  state.player.questionDurations = [];
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const qList = state.questions;
  if (!qList || qList.length === 0) {
    console.warn('Questions list is empty!');
    return;
  }

  const qIndex = state.player.currentQIndex;
  if (qIndex >= qList.length) {
    submitParticipantQuiz();
    return;
  }

  const currentQ = qList[qIndex];

  // Update question header indicators
  document.getElementById('q-current-idx').textContent = qIndex + 1;
  document.getElementById('q-total-count').textContent = qList.length;
  document.getElementById('q-player-score').textContent = state.player.score;

  const progressPercent = ((qIndex) / qList.length) * 100;
  document.getElementById('q-progress-fill').style.width = `${progressPercent}%`;

  // Question Title
  document.getElementById('q-question-text').textContent = currentQ.question;

  // Double Points Banner
  const doubleBanner = document.getElementById('q-double-banner');
  if (doubleBanner) {
    doubleBanner.style.display = currentQ.isDoublePoints ? 'inline-flex' : 'none';
  }

  // Hide explanation box
  const explanationBox = document.getElementById('q-explanation-box');
  if (explanationBox) explanationBox.style.display = 'none';

  // Render 4 Options
  const optionsContainer = document.getElementById('q-options-container');
  optionsContainer.innerHTML = '';

  const optionLetters = ['A', 'B', 'C', 'D'];
  currentQ.options.forEach((optText, optIdx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.id = `option-btn-${optIdx}`;
    btn.innerHTML = `
      <span class="option-badge">${optionLetters[optIdx]}</span>
      <span class="option-text">${optText}</span>
    `;
    btn.onclick = () => selectOption(optIdx);
    optionsContainer.appendChild(btn);
  });

  // Start Countdown Timer
  startQuestionTimer(currentQ.timeLimit || state.timePerQuestion || 20);
}

function startQuestionTimer(seconds) {
  clearInterval(state.timerInterval);
  state.timeLeft = seconds;

  const timerPill = document.getElementById('q-timer-pill');
  const timeLeftEl = document.getElementById('q-time-left');

  timeLeftEl.textContent = state.timeLeft;
  timerPill.classList.remove('urgent');

  state.player.questionStartTimes[state.player.currentQIndex] = Date.now();

  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    timeLeftEl.textContent = state.timeLeft;

    if (state.timeLeft <= 5) {
      timerPill.classList.add('urgent');
      SoundFX.urgentTick();
    } else {
      SoundFX.tick();
    }

    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      // Auto advance on timeout
      handleQuestionTimeout();
    }
  }, 1000);
}

function handleQuestionTimeout() {
  // If no answer selected, record -1
  selectOption(-1, true);
}

function selectOption(optIndex, isTimeout = false) {
  clearInterval(state.timerInterval);

  // Disable all options buttons to prevent double-clicks
  const buttons = document.querySelectorAll('.option-btn');
  buttons.forEach(b => b.disabled = true);

  const qIndex = state.player.currentQIndex;
  const currentQ = state.questions[qIndex];
  const startTime = state.player.questionStartTimes[qIndex] || Date.now();
  const durationSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
  state.player.questionDurations[qIndex] = durationSec;
  state.player.answers[qIndex] = optIndex;

  const timeLimit = (currentQ && currentQ.timeLimit) || state.timePerQuestion || 20;

  if (optIndex >= 0) {
    SoundFX.select();
    const selectedBtn = document.getElementById(`option-btn-${optIndex}`);
    if (selectedBtn) selectedBtn.classList.add('selected');

    // Dynamic live score calculation & micro-feedback
    const isDouble = !!(currentQ && currentQ.isDoublePoints);
    const multiplier = isDouble ? 2 : 1;
    const speedRatio = Math.max(0, (timeLimit - durationSec) / timeLimit);
    const pts = Math.round((500 + 500 * speedRatio) * multiplier);

    state.player.score += pts;
    const scoreEl = document.getElementById('q-player-score');
    if (scoreEl) scoreEl.textContent = state.player.score;

    if (isDouble) {
      showToast(`🔥 +${pts} pts (2X DOUBLE POINTS!)`, '⚡');
    } else if (speedRatio >= 0.5) {
      showToast(`⚡ +${pts} pts (Fast Answer: ${durationSec}s!)`, '🎯');
    }
  } else {
    SoundFX.wrong();
    showToast("⏰ Time's up for this question!", '⌛');
  }

  // Short delay for satisfying micro-interaction before advancing
  setTimeout(() => {
    state.player.currentQIndex++;
    if (state.player.currentQIndex < state.questions.length) {
      renderCurrentQuestion();
    } else {
      submitParticipantQuiz();
    }
  }, 650);
}

// Keyboard shortcuts for answering (1,2,3,4 or A,B,C,D)
window.addEventListener('keydown', (e) => {
  if (state.currentView !== 'quiz') return;
  const activeScreen = document.getElementById('quiz-screen-active');
  if (activeScreen.style.display !== 'block') return;

  const key = e.key.toUpperCase();
  const keyMap = { '1': 0, 'A': 0, '2': 1, 'B': 1, '3': 2, 'C': 2, '4': 3, 'D': 3 };

  if (key in keyMap) {
    const optIdx = keyMap[key];
    const btn = document.getElementById(`option-btn-${optIdx}`);
    if (btn && !btn.disabled) {
      selectOption(optIdx);
    }
  }
});

// Submit Quiz to Server
async function submitParticipantQuiz() {
  clearInterval(state.timerInterval);
  showQuizSubscreen('active');
  document.getElementById('q-question-text').textContent = 'Calculating score & ranking...';

  const totalTimeSec = state.player.questionDurations.reduce((a, b) => a + b, 0);
  state.player.totalTimeSec = totalTimeSec;

  try {
    const payload = {
      name: state.player.name,
      avatar: state.player.avatar,
      answers: state.player.answers,
      durations: state.player.questionDurations,
      totalTimeSec
    };

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      state.player.started = false;
      state.player.completed = true;
      state.player.score = data.entry.score;
      state.player.detailedResults = data.detailedResults;

      showParticipantResults(data);
    } else {
      const err = await res.json();
      showToast(err.error || 'Failed to submit quiz results', '⚠️');
    }
  } catch (err) {
    console.error('Submit error:', err);
    showToast('Network error while submitting. Please try again.', '⚠️');
  }
}

function showParticipantResults(data) {
  showQuizSubscreen('result');
  confetti.burst(150);
  SoundFX.fanfare();

  document.getElementById('res-score').textContent = data.entry.score;
  document.getElementById('res-correct').textContent = `${data.entry.correctCount}/${data.entry.totalQuestions}`;
  document.getElementById('res-time').textContent = `${data.entry.totalTimeSec}s`;

  const rankEl = document.getElementById('res-rank-num');
  rankEl.textContent = `#${data.rank}`;

  const noteEl = document.getElementById('res-rank-note');
  if (data.rank === 1) {
    rankEl.style.color = '#fbbf24';
    noteEl.textContent = '🎉 UNBELIEVABLE! You are currently #1 on the Open Day Leaderboard! 👑';
  } else if (data.rank <= 3) {
    rankEl.style.color = '#38bdf8';
    noteEl.textContent = `🔥 Outstanding! You are in the Top 3 podium (#${data.rank})!`;
  } else {
    rankEl.style.color = '#94a3b8';
    noteEl.textContent = `Great effort! Ranked #${data.rank} out of all participants.`;
  }

  // Populate answers review
  populateAnswersReview(data.detailedResults);
}

function populateAnswersReview(detailedResults) {
  const container = document.getElementById('answers-review-container');
  if (!container || !Array.isArray(detailedResults)) return;

  container.innerHTML = '';
  detailedResults.forEach((item, idx) => {
    const div = document.createElement('div');
    div.style.background = 'rgba(8, 16, 29, 0.85)';
    div.style.border = `1px solid ${item.isCorrect ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'}`;
    div.style.borderRadius = '12px';
    div.style.padding = '14px';
    div.style.marginBottom = '10px';

    const chosenText = item.chosen !== -1 && state.questions[idx]?.options[item.chosen] ? state.questions[idx].options[item.chosen] : 'No answer selected (Timed out)';
    const correctText = state.questions[idx]?.options[item.correct] || 'Correct answer';
    const ptsBadge = item.isCorrect 
      ? `<span style="font-family:var(--font-mono); font-weight:bold; color:${item.isDoublePoints ? '#fbbf24' : '#34d399'}; font-size:0.85rem;">+${item.pointsEarned} pts ⏱️ ${item.duration}s${item.isDoublePoints ? ' 🔥 2X' : ''}</span>`
      : `<span style="font-family:var(--font-mono); font-weight:bold; color:#fb7185; font-size:0.85rem;">+0 pts</span>`;

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
        <span style="font-weight:700; color:#fff;">${item.isCorrect ? '✅' : '❌'} Q${idx + 1}: ${item.question}</span>
        ${ptsBadge}
      </div>
      <div style="font-size:0.9rem; color:${item.isCorrect ? '#34d399' : '#fb7185'};">
        Your Answer: <strong>${chosenText}</strong>
      </div>
      ${!item.isCorrect ? `<div style="font-size:0.9rem; color:#38bdf8;">Correct Answer: <strong>${correctText}</strong></div>` : ''}
      ${item.explanation ? `<div style="font-size:0.85rem; color:#94a3b8; margin-top:6px; font-style:italic;">💡 ${item.explanation}</div>` : ''}
    `;
    container.appendChild(div);
  });
}

function toggleAnswerReview() {
  SoundFX.click();
  const c = document.getElementById('answers-review-container');
  if (c) {
    c.style.display = c.style.display === 'none' ? 'block' : 'none';
  }
}

function restartParticipantQuiz() {
  SoundFX.click();
  state.player.started = false;
  state.player.completed = false;
  state.player.score = 0;
  state.player.answers = [];
  state.player.currentQIndex = 0;
  showQuizSubscreen('join');
}

// ===================================================
// 7. LIVE LEADERBOARD / BIG SCREEN RENDERING
// ===================================================
function renderLeaderboard() {
  const tbody = document.getElementById('leaderboard-tbody');
  const emptyMsg = document.getElementById('empty-board-msg');
  if (!tbody) return;

  const list = state.leaderboard;

  // Render Top 3 Podium
  updatePodium(list);

  if (!list || list.length === 0) {
    tbody.innerHTML = '';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';
  tbody.innerHTML = '';

  list.forEach((entry, index) => {
    const rank = index + 1;
    let rankBadgeClass = '';
    let rankDisplay = `#${rank}`;

    if (rank === 1) { rankBadgeClass = 'rank-top-1'; rankDisplay = '🥇 1'; }
    else if (rank === 2) { rankBadgeClass = 'rank-top-2'; rankDisplay = '🥈 2'; }
    else if (rank === 3) { rankBadgeClass = 'rank-top-3'; rankDisplay = '🥉 3'; }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="rank-cell ${rankBadgeClass}">${rankDisplay}</td>
      <td>
        <div class="player-cell">
          <span class="player-avatar">${entry.avatar || '🚀'}</span>
          <span>${escapeHtml(entry.name)}</span>
        </div>
      </td>
      <td class="score-cell" style="text-align: right;">${entry.score.toLocaleString()}</td>
      <td style="text-align: center;">
        <span class="accuracy-badge">${entry.correctCount}/${entry.totalQuestions} (${Math.round((entry.correctCount / entry.totalQuestions) * 100)}%)</span>
      </td>
      <td style="text-align: right; color:var(--text-muted); font-size:0.9rem;">${entry.totalTimeSec}s</td>
    `;
    tbody.appendChild(tr);
  });
}

function updatePodium(list) {
  const p1Name = document.getElementById('podium-name-1');
  const p1Score = document.getElementById('podium-score-1');
  const p1Avatar = document.getElementById('podium-avatar-1');

  const p2Name = document.getElementById('podium-name-2');
  const p2Score = document.getElementById('podium-score-2');
  const p2Avatar = document.getElementById('podium-avatar-2');

  const p3Name = document.getElementById('podium-name-3');
  const p3Score = document.getElementById('podium-score-3');
  const p3Avatar = document.getElementById('podium-avatar-3');

  // 1st Place
  if (list[0]) {
    p1Name.textContent = list[0].name;
    p1Score.textContent = `${list[0].score} pts`;
    p1Avatar.textContent = list[0].avatar || '🚀';
  } else {
    p1Name.textContent = 'Waiting...';
    p1Score.textContent = '-- pts';
    p1Avatar.textContent = '🚀';
  }

  // 2nd Place
  if (list[1]) {
    p2Name.textContent = list[1].name;
    p2Score.textContent = `${list[1].score} pts`;
    p2Avatar.textContent = list[1].avatar || '⚡';
  } else {
    p2Name.textContent = 'Waiting...';
    p2Score.textContent = '-- pts';
    p2Avatar.textContent = '⚡';
  }

  // 3rd Place
  if (list[2]) {
    p3Name.textContent = list[2].name;
    p3Score.textContent = `${list[2].score} pts`;
    p3Avatar.textContent = list[2].avatar || '💻';
  } else {
    p3Name.textContent = 'Waiting...';
    p3Score.textContent = '-- pts';
    p3Avatar.textContent = '💻';
  }
}

function refreshLeaderboard() {
  SoundFX.click();
  fetchStateREST();
}

// ===================================================
// 8. ADMIN CONTROL PANEL
// ===================================================
async function handleAdminLogin(e) {
  e.preventDefault();
  SoundFX.click();

  const passwordInput = document.getElementById('admin-password-input');
  const password = passwordInput.value;

  try {
    const res = await fetch('/api/admin/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (res.ok) {
      const data = await res.json();
      state.admin.isLoggedIn = true;
      state.admin.password = password;
      state.admin.questionsCache = data.questions;

      document.getElementById('admin-login-view').style.display = 'none';
      document.getElementById('admin-dashboard-view').style.display = 'block';

      showToast('Admin authenticated successfully!', '🔓');
      renderAdminDashboard(data);
    } else {
      showToast('Invalid admin password! Try again.', '❌');
      SoundFX.wrong();
    }
  } catch (err) {
    showToast('Failed to authenticate with server.', '⚠️');
  }
}

function handleAdminLogout() {
  SoundFX.click();
  state.admin.isLoggedIn = false;
  state.admin.password = '';
  document.getElementById('admin-login-view').style.display = 'block';
  document.getElementById('admin-dashboard-view').style.display = 'none';
  showToast('Logged out of Admin Panel.', '🔒');
}

async function sendAdminAction(action, payload = null) {
  SoundFX.click();
  if (!state.admin.isLoggedIn) return;

  const msg = {
    type: 'ADMIN_ACTION',
    password: state.admin.password,
    action,
    payload
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    sendWs(msg);
  } else {
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: state.admin.password, action, payload })
      });
      if (res.ok) {
        showToast(`Action executed: ${action}`, '✅');
        fetchStateREST();
        refreshAdminData();
      }
    } catch (e) {
      showToast('Failed to execute admin action', '⚠️');
    }
  }
}


function confirmClearLeaderboard() {
  if (confirm('Are you sure you want to delete all participant submissions from the leaderboard?')) {
    sendAdminAction('CLEAR_LEADERBOARD');
  }
}

async function refreshAdminData() {
  if (!state.admin.isLoggedIn) return;
  try {
    const res = await fetch('/api/admin/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: state.admin.password })
    });
    if (res.ok) {
      const data = await res.json();
      state.admin.questionsCache = data.questions;
      renderAdminDashboard(data);
    }
  } catch (e) {}
}

function renderAdminDashboard(data) {
  if (!state.admin.isLoggedIn) return;

  // Stats
  const statStatus = document.getElementById('admin-stat-status');
  const statPlayers = document.getElementById('admin-stat-players');
  const statTop = document.getElementById('admin-stat-top');

  if (statStatus) statStatus.textContent = state.status.replace('_', ' ').toUpperCase();
  if (statPlayers) statPlayers.textContent = state.leaderboard.length;
  if (statTop) statTop.textContent = state.leaderboard[0] ? `${state.leaderboard[0].name} (${state.leaderboard[0].score})` : 'None';

  // Questions Editor Accordion
  renderAdminQuestionsEditor(state.admin.questionsCache || state.questions);

  // Submissions Table
  renderAdminSubmissionsTable();

  // Supabase DB Status
  if (data && data.dbStatus) {
    renderDbStatus(data.dbStatus);
  } else {
    fetchDbStatus();
  }
}

async function fetchDbStatus() {
  try {
    const res = await fetch('/api/db/status');
    if (res.ok) {
      const dbStatus = await res.json();
      renderDbStatus(dbStatus);
    }
  } catch (e) {}
}

function renderDbStatus(dbStatus) {
  const badge = document.getElementById('db-status-badge');
  const msg = document.getElementById('db-feedback-msg');
  if (!badge) return;

  if (dbStatus && dbStatus.isConnected) {
    badge.className = 'status-badge active';
    badge.textContent = 'SUPABASE CLOUD ACTIVE';
    if (msg) msg.innerHTML = 'Cloud database is active! All questions and scores are synced in Supabase PostgreSQL.';
  } else {
    badge.className = 'status-badge not_started';
    badge.textContent = 'LOCAL STORAGE';
    if (msg) msg.innerHTML = `${dbStatus?.error || 'Enter your Supabase password above to activate cloud database sync.'}`;
  }
}

async function connectSupabaseDb() {
  SoundFX.click();
  const passInput = document.getElementById('db-password-input');
  const dbPassword = passInput.value.trim();
  const feedback = document.getElementById('db-feedback-msg');

  if (!dbPassword) {
    showToast('Please type your Supabase database password', '⚠️');
    return;
  }

  if (feedback) feedback.innerHTML = '⏳ Connecting to Supabase PostgreSQL at aws-1-eu-central-1.pooler.supabase.com...';

  try {
    const res = await fetch('/api/admin/db/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: state.admin.password,
        dbPassword
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      SoundFX.fanfare();
      showToast('Successfully connected to Supabase PostgreSQL!', '🐘');
      fetchDbStatus();
      passInput.value = '';
    } else {
      SoundFX.wrong();
      showToast(data.error || 'Connection failed', '❌');
      if (feedback) feedback.innerHTML = `❌ <span style="color:#fb7185">${data.error || 'Connection failed'}</span>`;
    }
  } catch (err) {
    showToast('Failed to reach server', '⚠️');
  }
}

function renderAdminQuestionsEditor(questions) {
  const container = document.getElementById('admin-questions-accordion');
  const countEl = document.getElementById('admin-q-count');
  if (!container) return;

  if (countEl) countEl.textContent = questions.length;
  container.innerHTML = '';

  questions.forEach((q, qIdx) => {
    const item = document.createElement('div');
    item.className = 'accordion-item' + (qIdx === 0 ? ' open' : '');

    const optionLetters = ['A', 'B', 'C', 'D'];
    let optionsHtml = '';

    q.options.forEach((opt, optIdx) => {
      const isCorrect = q.correctAnswer === optIdx;
      optionsHtml += `
        <div class="admin-option-card ${isCorrect ? 'correct' : ''}">
          <div class="admin-option-header">
            <span class="option-badge ${isCorrect ? 'correct' : ''}">Option ${optionLetters[optIdx]}</span>
            <button type="button" class="cyber-btn ${isCorrect ? 'btn-start' : 'btn-secondary'}" onclick="setQuestionCorrect(${qIdx}, ${optIdx})">
              ${isCorrect ? '✓ Correct Answer' : 'Set as Correct'}
            </button>
          </div>
          <input type="text" class="cyber-input opt-val" data-qidx="${qIdx}" data-optidx="${optIdx}" value="${escapeHtml(opt)}" placeholder="Option ${optionLetters[optIdx]}">
        </div>
      `;
    });

    item.innerHTML = `
      <div class="accordion-header" onclick="toggleAccordion(this)">
        <div class="accordion-title">
          <span class="q-badge">#${qIdx + 1}</span>
          <span class="q-title-text">${escapeHtml(q.question.slice(0, 50))}${q.question.length > 50 ? '...' : ''}</span>
          <span class="q-correct-tag">Correct: Option ${optionLetters[q.correctAnswer || 0]}</span>
          ${q.isDoublePoints ? '<span class="q-double-tag">🔥 2X POINTS</span>' : ''}
        </div>
        <span class="accordion-arrow">▼</span>
      </div>
      <div class="accordion-body">
        <div class="double-points-toggle-row ${q.isDoublePoints ? 'active' : ''}">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:1.4rem;">🔥</span>
            <div>
              <strong style="color:${q.isDoublePoints ? '#fbbf24' : '#cbd5e1'}; font-size:0.9rem;">
                ${q.isDoublePoints ? 'Double Points (2X Multiplier Active)' : 'Standard Points (1X Multiplier)'}
              </strong>
              <p style="font-size:0.78rem; color:var(--text-muted); margin:0;">
                ${q.isDoublePoints ? 'Participants earn double points (up to 2,000 pts) for answering this question fast!' : 'Standard scoring (up to 1,000 pts based on answer speed).'}
              </p>
            </div>
          </div>
          <button type="button" class="cyber-btn ${q.isDoublePoints ? 'btn-double-on' : 'btn-secondary'}" onclick="toggleQuestionDoublePoints(${qIdx})">
            ${q.isDoublePoints ? '🔥 2X ACTIVE (Click to Turn Off)' : '⚡ Make 2X Double Points'}
          </button>
        </div>

        <div class="input-group">
          <label class="input-label">Question Text</label>
          <input type="text" class="cyber-input q-text-input" data-qidx="${qIdx}" value="${escapeHtml(q.question)}" placeholder="Enter question text">
        </div>
        
        <div class="admin-options-grid">
          ${optionsHtml}
        </div>

        <div class="input-group">
          <label class="input-label">Explanation / Fun Fact (Shown to participant after answering)</label>
          <input type="text" class="cyber-input q-exp-input" data-qidx="${qIdx}" value="${escapeHtml(q.explanation || '')}" placeholder="Explanation of correct answer">
        </div>

        <div class="admin-question-footer">
          <div class="timer-control">
            <label>⏱️ Timer (seconds):</label>
            <input type="number" class="cyber-input q-time-input" data-qidx="${qIdx}" value="${q.timeLimit || 20}" min="5" max="120">
          </div>
          <div style="display:flex; gap:10px;">
            <button type="button" class="cyber-btn btn-save" onclick="saveIndividualQuestion(${qIdx})">
              💾 Save This Question
            </button>
            <button type="button" class="cyber-btn btn-danger" onclick="deleteQuestion(${qIdx})">
              🗑️ Delete
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(item);
  });
}

function toggleQuestionDoublePoints(qIdx) {
  SoundFX.click();
  collectQuestionInputsFromDOM();
  if (state.admin.questionsCache[qIdx]) {
    state.admin.questionsCache[qIdx].isDoublePoints = !state.admin.questionsCache[qIdx].isDoublePoints;
  }
  renderAdminQuestionsEditor(state.admin.questionsCache);
  const statusTxt = state.admin.questionsCache[qIdx].isDoublePoints ? 'ACTIVATED (2X) 🔥' : 'TURNED OFF (1X) ⚡';
  showToast(`Question #${qIdx + 1} Double Points ${statusTxt}`, '🔥');
}

function toggleAccordion(headerEl) {
  const item = headerEl.parentElement;
  item.classList.toggle('open');
}

function setQuestionCorrect(qIdx, optIdx) {
  SoundFX.click();
  collectQuestionInputsFromDOM();
  if (state.admin.questionsCache[qIdx]) {
    state.admin.questionsCache[qIdx].correctAnswer = optIdx;
  }
  renderAdminQuestionsEditor(state.admin.questionsCache);
}

function collectQuestionInputsFromDOM() {
  const qTextInputs = document.querySelectorAll('.q-text-input');
  qTextInputs.forEach(input => {
    const qIdx = parseInt(input.dataset.qidx);
    if (state.admin.questionsCache[qIdx]) {
      state.admin.questionsCache[qIdx].question = input.value.trim();
    }
  });

  const optInputs = document.querySelectorAll('.opt-val');
  optInputs.forEach(input => {
    const qIdx = parseInt(input.dataset.qidx);
    const optIdx = parseInt(input.dataset.optidx);
    if (state.admin.questionsCache[qIdx]) {
      state.admin.questionsCache[qIdx].options[optIdx] = input.value.trim();
    }
  });

  const expInputs = document.querySelectorAll('.q-exp-input');
  expInputs.forEach(input => {
    const qIdx = parseInt(input.dataset.qidx);
    if (state.admin.questionsCache[qIdx]) {
      state.admin.questionsCache[qIdx].explanation = input.value.trim();
    }
  });

  const timeInputs = document.querySelectorAll('.q-time-input');
  timeInputs.forEach(input => {
    const qIdx = parseInt(input.dataset.qidx);
    if (state.admin.questionsCache[qIdx]) {
      state.admin.questionsCache[qIdx].timeLimit = parseInt(input.value) || 20;
    }
  });
}

function saveIndividualQuestion(qIdx) {
  SoundFX.click();
  collectQuestionInputsFromDOM();
  sendAdminAction('UPDATE_QUESTIONS', { questions: state.admin.questionsCache });
  showToast(`Question #${qIdx + 1} updated and synced!`, '💾');
}

function addNewQuestion() {
  SoundFX.click();
  collectQuestionInputsFromDOM();
  const newQ = {
    id: Date.now(),
    question: `New Open Day Question #${state.admin.questionsCache.length + 1}`,
    options: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
    correctAnswer: 0,
    timeLimit: 20,
    explanation: 'Explanation for this question'
  };
  state.admin.questionsCache.push(newQ);
  renderAdminQuestionsEditor(state.admin.questionsCache);
  showToast('New question added! Remember to click Save All Questions.', '➕');
}

function deleteQuestion(qIdx) {
  SoundFX.click();
  collectQuestionInputsFromDOM();
  if (state.admin.questionsCache.length <= 1) {
    showToast('Quiz must have at least 1 question!', '⚠️');
    return;
  }
  state.admin.questionsCache.splice(qIdx, 1);
  renderAdminQuestionsEditor(state.admin.questionsCache);
  sendAdminAction('UPDATE_QUESTIONS', { questions: state.admin.questionsCache });
  showToast('Question deleted and synced!', '🗑️');
}

function resetDefaultQuestions() {
  if (confirm('Restore default 10 Open Day questions? Your customized questions will be replaced.')) {
    SoundFX.click();
    fetch('/api/state').then(r => r.json()).then(() => {
      window.location.reload();
    });
  }
}

function saveQuestionsToAdmin() {
  SoundFX.click();
  collectQuestionInputsFromDOM();
  sendAdminAction('UPDATE_QUESTIONS', { questions: state.admin.questionsCache });
  showToast(`All ${state.admin.questionsCache.length} questions saved and synced!`, '💾');
}

function simulateTestPlayer() {
  SoundFX.click();
  sendAdminAction('SIMULATE_PLAYER');
  showToast('Test participant submitted! Check Live Board! 🚀', '⚡');
}

function renderAdminSubmissionsTable() {
  const tbody = document.getElementById('admin-submissions-tbody');
  if (!tbody) return;

  const list = state.leaderboard;
  tbody.innerHTML = '';

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:24px;">No participant entries yet</td></tr>`;
    return;
  }

  list.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${idx + 1}</td>
      <td>${entry.avatar || '🚀'} ${escapeHtml(entry.name)}</td>
      <td style="color:var(--neon-cyan); font-weight:bold;">${entry.score}</td>
      <td>${entry.correctCount}/${entry.totalQuestions}</td>
      <td>${entry.totalTimeSec}s</td>
      <td>
        <button class="cyber-btn btn-danger" style="width:auto; padding:4px 10px; font-size:0.75rem;" onclick="deleteSubmissionEntry('${entry.id}')">
          Delete
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function deleteSubmissionEntry(id) {
  if (confirm('Delete this submission?')) {
    sendAdminAction('DELETE_ENTRY', { id });
  }
}

function exportLeaderboardCSV() {
  SoundFX.click();
  const list = state.leaderboard;
  if (list.length === 0) {
    showToast('No entries to export!', '⚠️');
    return;
  }

  let csv = 'Rank,Name,Score,Correct,TotalQuestions,TimeSeconds,SubmittedAt\n';
  list.forEach((e, idx) => {
    csv += `${idx + 1},"${e.name.replace(/"/g, '""')}",${e.score},${e.correctCount},${e.totalQuestions},${e.totalTimeSec},"${e.submittedAt || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wf_club_quiz_leaderboard_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Leaderboard CSV exported!', '📥');
}

// Utility: HTML escaping
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// ===================================================
// INITIALIZATION
// ===================================================
window.addEventListener('DOMContentLoaded', () => {
  confetti.init();
  connectWebSocket();
  fetchStateREST();

  // 100% Live Scoreboard auto-sync polling every 2.5 seconds
  setInterval(() => {
    fetchStateREST();
  }, 2500);

  // Allow clicking anywhere to unlock Web Audio on mobile
  document.body.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }, { once: true });
});
