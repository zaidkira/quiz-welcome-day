const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'quiz-data.json');
const ENV_FILE = path.join(__dirname, '.env');

// Helper to get local IP address for easy phone connection
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Default 10 Questions tailored for Club Open Day
const DEFAULT_QUESTIONS = [
  {
    id: 1,
    question: "What does 'WF' stand for in our tech club's vision?",
    options: [
      "Web & Future Technologies",
      "Wave Formators",
      "Wireless Frontiers",
      "World of Futures"
    ],
    correctAnswer: 0,
    timeLimit: 20,
    explanation: "WF stands for Web & Future Technologies — empowering students to build cutting-edge digital solutions!"
  },
  {
    id: 2,
    question: "Which data structure operates on a 'Last In, First Out' (LIFO) principle?",
    options: [
      "Queue",
      "Stack",
      "Binary Tree",
      "Linked List"
    ],
    correctAnswer: 1,
    timeLimit: 20,
    explanation: "A Stack operates on LIFO (Last In, First Out), just like a stack of plates!"
  },
  {
    id: 3,
    question: "What year was the World Wide Web introduced to the public by Tim Berners-Lee?",
    options: [
      "1985",
      "1991",
      "1995",
      "2000"
    ],
    correctAnswer: 1,
    timeLimit: 20,
    explanation: "The World Wide Web became publicly available in August 1991."
  },
  {
    id: 4,
    question: "In programming, what does the acronym 'API' stand for?",
    options: [
      "Application Programming Interface",
      "Automated Processing Instruction",
      "Advanced Program Integration",
      "Applied Protocol Identifier"
    ],
    correctAnswer: 0,
    timeLimit: 20,
    explanation: "API stands for Application Programming Interface, allowing software systems to communicate."
  },
  {
    id: 5,
    question: "Which of the following is NOT an open-source operating system?",
    options: [
      "Ubuntu Linux",
      "FreeBSD",
      "Microsoft Windows",
      "Debian"
    ],
    correctAnswer: 2,
    timeLimit: 20,
    explanation: "Microsoft Windows is proprietary commercial software, while Linux and BSD distributions are open source."
  },
  {
    id: 6,
    question: "What is the primary purpose of joining our club during Open Day?",
    options: [
      "Hands-on projects & workshops",
      "Hackathons & tech competitions",
      "Networking with passionate peers & mentors",
      "All of the above!"
    ],
    correctAnswer: 3,
    timeLimit: 20,
    explanation: "All of the above! Our club is all about real projects, team hackathons, learning, and having fun!"
  },
  {
    id: 7,
    question: "What does 'AI' stand for in modern computing?",
    options: [
      "Automated Intelligence",
      "Artificial Intelligence",
      "Algorithmic Interface",
      "Advanced Information"
    ],
    correctAnswer: 1,
    timeLimit: 20,
    explanation: "Artificial Intelligence (AI) simulates human intelligence processes through machines."
  },
  {
    id: 8,
    question: "In web development, which language is primarily responsible for page interactivity?",
    options: [
      "HTML",
      "CSS",
      "JavaScript",
      "SQL"
    ],
    correctAnswer: 2,
    timeLimit: 20,
    isDoublePoints: true,
    explanation: "JavaScript is the programming language that enables interactive web experiences."
  },
  {
    id: 9,
    question: "What is a 'Bug' in computer programming famously named after?",
    options: [
      "A real moth trapped in a relay of the Mark II computer in 1947",
      "A nickname of computer scientist Grace Hopper's pet",
      "A popular retro arcade game",
      "An acronym for 'Binary Unit Glitch'"
    ],
    correctAnswer: 0,
    timeLimit: 20,
    isDoublePoints: true,
    explanation: "In 1947, engineers found a real moth trapped in the Harvard Mark II computer and taped it into their logbook!"
  },
  {
    id: 10,
    question: "What is the best way to level up your tech skills this semester?",
    options: [
      "Watching random tutorials alone without coding",
      "Joining the WF Club and building awesome real projects together!",
      "Memorizing the entire dictionary of programming keywords",
      "Waiting until the night before the final exam"
    ],
    correctAnswer: 1,
    timeLimit: 20,
    isDoublePoints: true,
    explanation: "Joining the WF Club gives you hands-on workshops, team hackathons, and great friends!"
  }
];

// Initial state
let quizState = {
  status: 'not_started', // 'not_started' | 'active' | 'ended'
  startedAt: null,
  endedAt: null,
  activeQuestionIndex: 0,
  mode: 'self_paced',
  timePerQuestion: 20,
  adminPassword: process.env.ADMIN_PASSWORD || '7nahomawaves',
  questions: DEFAULT_QUESTIONS,
  leaderboard: [],
  participants: {}
};

// 1. Load local saved data as fallback
if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    quizState = { ...quizState, ...parsed };
    console.log('[DATA] Loaded existing local quiz data.');
  } catch (err) {
    console.error('[DATA] Failed to parse local quiz data:', err);
  }
}

// 2. Database Sync Initialization
async function initializeDatabaseState() {
  const dbConnected = await db.initDb();
  if (dbConnected) {
    try {
      // Sync config
      const dbConfig = await db.loadConfigFromDb();
      if (dbConfig) {
        quizState.status = dbConfig.status || quizState.status;
        quizState.startedAt = dbConfig.startedAt || quizState.startedAt;
        quizState.endedAt = dbConfig.endedAt || quizState.endedAt;
        quizState.timePerQuestion = dbConfig.timePerQuestion || quizState.timePerQuestion;
        quizState.adminPassword = process.env.ADMIN_PASSWORD || dbConfig.adminPassword || '7nahomawaves';
        if (dbConfig.adminPassword !== quizState.adminPassword) {
          await db.saveConfigToDb(quizState);
        }
      } else {
        await db.saveConfigToDb(quizState);
      }

      // Sync questions
      const dbQuestions = await db.loadQuestionsFromDb();
      if (dbQuestions && dbQuestions.length > 0) {
        quizState.questions = dbQuestions;
        console.log(`[DB] Loaded ${dbQuestions.length} questions from Supabase.`);
      } else {
        await db.saveQuestionsToDb(quizState.questions);
      }

      // Sync leaderboard
      const dbLeaderboard = await db.loadLeaderboardFromDb();
      if (dbLeaderboard) {
        quizState.leaderboard = dbLeaderboard;
        console.log(`[DB] Loaded ${dbLeaderboard.length} submissions from Supabase.`);
      }

      saveLocalState();
    } catch (e) {
      console.error('[DB] Error during initial sync:', e.message);
    }
  }
}

function saveLocalState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(quizState, null, 2), 'utf8');
  } catch (err) {
    console.error('[DATA] Failed to save local state:', err);
  }
}

// Broadcast to all connected WebSockets
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Client questions (includes correctAnswer & explanation for end-of-question validation & feedback)
function getSanitizedQuestions() {
  return quizState.questions.map(q => ({
    id: q.id,
    question: q.question,
    options: q.options,
    timeLimit: q.timeLimit || quizState.timePerQuestion,
    isDoublePoints: !!q.isDoublePoints,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation || ''
  }));
}

function getPublicState() {
  return {
    status: quizState.status,
    startedAt: quizState.startedAt,
    endedAt: quizState.endedAt,
    mode: quizState.mode,
    timePerQuestion: quizState.timePerQuestion,
    totalQuestions: quizState.questions.length,
    questions: getSanitizedQuestions(),
    leaderboard: quizState.leaderboard.sort((a, b) => b.score - a.score || a.totalTimeSec - b.totalTimeSec),
    totalParticipants: Object.keys(quizState.participants).length,
    dbStatus: db.getDbStatus()
  };
}

// Express setup
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// QR code generation endpoint
app.get('/api/qr', async (req, res) => {
  const localIp = getLocalIP();
  const host = req.get('host');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  let url = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (!url) {
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      url = `${proto}://${host}`;
    } else {
      url = `http://${localIp}:${PORT}`;
    }
  }
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      margin: 1,
      color: {
        dark: '#00d2ff',
        light: '#0b1528'
      },
      width: 250
    });
    res.json({ url, qrDataUrl, localIp, port: PORT });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// REST API for public state
app.get('/api/state', (req, res) => {
  res.json(getPublicState());
});

// REST API for database status
app.get('/api/db/status', (req, res) => {
  res.json(db.getDbStatus());
});

// REST API for admin state (includes full questions & secrets)
app.post('/api/admin/state', (req, res) => {
  const { password } = req.body;
  if (password !== quizState.adminPassword) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  res.json({
    ...quizState,
    localIp: getLocalIP(),
    port: PORT,
    dbStatus: db.getDbStatus(),
    leaderboard: quizState.leaderboard.sort((a, b) => b.score - a.score || a.totalTimeSec - b.totalTimeSec)
  });
});

// Connect to Supabase with custom password or connection string
app.post('/api/admin/db/connect', async (req, res) => {
  const { password: adminPass, dbPassword, connectionString } = req.body;
  if (adminPass !== quizState.adminPassword) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }

  let finalConnStr = connectionString;
  if (!finalConnStr && dbPassword) {
    finalConnStr = `postgresql://postgres.bzaxtopopollapplqyhv:${encodeURIComponent(dbPassword)}@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`;
  }

  if (!finalConnStr) {
    return res.status(400).json({ error: 'Please provide either a database password or full connection string.' });
  }

  const connected = await db.initDb(finalConnStr);
  if (connected) {
    // Update .env file
    try {
      let envContent = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
      if (envContent.includes('DATABASE_URL=')) {
        envContent = envContent.replace(/DATABASE_URL=.*/, `DATABASE_URL=${finalConnStr}`);
      } else {
        envContent += `\nDATABASE_URL=${finalConnStr}\n`;
      }
      fs.writeFileSync(ENV_FILE, envContent, 'utf8');
    } catch (e) {
      console.warn('Could not update .env file:', e.message);
    }

    // Push current memory state to DB
    await db.saveConfigToDb(quizState);
    await db.saveQuestionsToDb(quizState.questions);
    for (const sub of quizState.leaderboard) {
      await db.saveSubmissionToDb(sub);
    }

    broadcast({
      type: 'DB_STATUS_CHANGED',
      dbStatus: db.getDbStatus()
    });

    res.json({ success: true, message: 'Successfully connected and synced with Supabase PostgreSQL!' });
  } else {
    res.status(400).json({ success: false, error: db.getDbStatus().error || 'Failed to connect to Supabase.' });
  }
});

// Core Admin Action Execution (Syncs to both DB & Memory)
async function executeAdminAction(action, payload) {
  switch (action) {
    case 'START_QUIZ':
      quizState.status = 'active';
      quizState.startedAt = new Date().toISOString();
      quizState.endedAt = null;
      saveLocalState();
      await db.saveConfigToDb(quizState);
      broadcast({
        type: 'QUIZ_STATUS_CHANGED',
        status: 'active',
        startedAt: quizState.startedAt
      });
      break;

    case 'END_QUIZ':
      quizState.status = 'ended';
      quizState.endedAt = new Date().toISOString();
      saveLocalState();
      await db.saveConfigToDb(quizState);
      broadcast({
        type: 'QUIZ_STATUS_CHANGED',
        status: 'ended',
        endedAt: quizState.endedAt
      });
      break;

    case 'RESET_QUIZ':
      quizState.status = 'not_started';
      quizState.startedAt = null;
      quizState.endedAt = null;
      saveLocalState();
      await db.saveConfigToDb(quizState);
      broadcast({
        type: 'QUIZ_STATUS_CHANGED',
        status: 'not_started'
      });
      break;

    case 'CLEAR_LEADERBOARD':
      quizState.leaderboard = [];
      quizState.participants = {};
      saveLocalState();
      await db.clearLeaderboardFromDb();
      broadcast({
        type: 'LEADERBOARD_UPDATE',
        leaderboard: []
      });
      break;

    case 'DELETE_ENTRY':
      if (payload && payload.id) {
        quizState.leaderboard = quizState.leaderboard.filter(e => e.id !== payload.id);
        delete quizState.participants[payload.id];
        saveLocalState();
        await db.deleteSubmissionFromDb(payload.id);
        broadcast({
          type: 'LEADERBOARD_UPDATE',
          leaderboard: quizState.leaderboard.sort((a, b) => b.score - a.score || a.totalTimeSec - b.totalTimeSec)
        });
      }
      break;

    case 'UPDATE_QUESTIONS':
      if (Array.isArray(payload?.questions) && payload.questions.length > 0) {
        quizState.questions = payload.questions.map((q, idx) => ({
          id: q.id || (idx + 1),
          question: q.question.trim(),
          options: Array.isArray(q.options) ? q.options.map(o => String(o).trim()) : ['A', 'B', 'C', 'D'],
          correctAnswer: Number(q.correctAnswer) || 0,
          timeLimit: Number(q.timeLimit) || 20,
          explanation: (q.explanation || '').trim(),
          isDoublePoints: !!q.isDoublePoints
        }));
        saveLocalState();
        await db.saveQuestionsToDb(quizState.questions);
        broadcast({
          type: 'QUESTIONS_UPDATED',
          questions: getSanitizedQuestions()
        });
      }
      break;

    case 'UPDATE_CONFIG':
      if (payload) {
        if (payload.timePerQuestion !== undefined) {
          quizState.timePerQuestion = Number(payload.timePerQuestion) || 20;
        }
        if (payload.adminPassword) {
          quizState.adminPassword = payload.adminPassword;
        }
        saveLocalState();
        await db.saveConfigToDb(quizState);
        broadcast({
          type: 'CONFIG_UPDATED',
          timePerQuestion: quizState.timePerQuestion
        });
      }
      break;

    case 'SIMULATE_PLAYER':
      const names = ['Karim Wave', 'Yasmine Cyber', 'Amine Tech', 'Lina Code', 'Nour Future', 'Rayane Dev'];
      const avatars = ['🚀', '⚡', '💻', '🧠', '🤖', '🔥', '🌐'];
      const simName = payload?.name || names[Math.floor(Math.random() * names.length)];
      const simAvatar = payload?.avatar || avatars[Math.floor(Math.random() * avatars.length)];
      const simCorrect = Math.floor(Math.random() * 4) + 7; // 7 to 10
      const simTime = Math.floor(Math.random() * 25) + 18; // 18 to 43s
      const avgDuration = simTime / quizState.questions.length;
      let simScore = 0;
      quizState.questions.slice(0, simCorrect).forEach((q) => {
        const mult = q.isDoublePoints ? 2 : 1;
        const speedRatio = Math.max(0.1, (20 - avgDuration) / 20);
        simScore += Math.round((500 + 500 * speedRatio) * mult);
      });

      const simEntry = {
        id: 'p_sim_' + Date.now(),
        name: simName,
        avatar: simAvatar,
        score: simScore,
        correctCount: simCorrect,
        totalQuestions: quizState.questions.length,
        totalTimeSec: simTime,
        submittedAt: new Date().toISOString()
      };

      quizState.leaderboard.push(simEntry);
      quizState.participants[simEntry.id] = { name: simEntry.name, avatar: simEntry.avatar };
      saveLocalState();
      await db.saveSubmissionToDb(simEntry);

      broadcast({
        type: 'LEADERBOARD_UPDATE',
        leaderboard: quizState.leaderboard.sort((a, b) => b.score - a.score || a.totalTimeSec - b.totalTimeSec),
        newEntry: simEntry
      });
      break;

    default:
      break;
  }
}

// REST admin action endpoint
app.post('/api/admin/action', async (req, res) => {
  const { password, action, payload } = req.body;
  if (password !== quizState.adminPassword) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  await executeAdminAction(action, payload);
  res.json({ success: true, action });
});

// REST submit result
app.post('/api/submit', async (req, res) => {
  const { name, avatar, answers, durations, totalTimeSec } = req.body;
  if (quizState.status !== 'active') {
    return res.status(400).json({ error: 'This quiz round has ended. Submissions are now closed! Check the live leaderboard for final standings.' });
  }
  if (!name || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Invalid submission data.' });
  }

  // Calculate score & accuracy with speed bonus and double points
  let correctCount = 0;
  let totalScore = 0;
  const detailedResults = [];

  quizState.questions.forEach((q, idx) => {
    const participantAns = answers[idx];
    const timeLimit = q.timeLimit || quizState.timePerQuestion || 20;
    const duration = Array.isArray(durations) && durations[idx] !== undefined 
      ? Number(durations[idx]) 
      : (totalTimeSec ? Math.round(totalTimeSec / quizState.questions.length) : timeLimit);
    
    const isCorrect = participantAns !== undefined && participantAns === q.correctAnswer;
    const isDouble = !!q.isDoublePoints;
    const multiplier = isDouble ? 2 : 1;

    let pointsEarned = 0;
    if (isCorrect) {
      correctCount++;
      // Speed bonus: answering faster awards more points (Kahoot-style)
      const clampedDuration = Math.max(0.5, Math.min(timeLimit, duration));
      const speedRatio = Math.max(0, (timeLimit - clampedDuration) / timeLimit);
      const basePoints = 500;
      const speedBonus = Math.round(500 * speedRatio);
      pointsEarned = (basePoints + speedBonus) * multiplier;
      totalScore += pointsEarned;
    }

    detailedResults.push({
      questionId: q.id,
      question: q.question,
      chosen: participantAns,
      correct: q.correctAnswer,
      isCorrect,
      isDoublePoints: isDouble,
      duration: Math.round(duration),
      pointsEarned,
      explanation: q.explanation || ''
    });
  });

  const calculatedTotalTime = Array.isArray(durations) && durations.length > 0
    ? durations.reduce((a, b) => a + Number(b || 0), 0)
    : (Number(totalTimeSec) || 0);

  const entry = {
    id: 'p_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: name.trim().slice(0, 30),
    avatar: avatar || '🚀',
    score: totalScore,
    correctCount,
    totalQuestions: quizState.questions.length,
    totalTimeSec: calculatedTotalTime,
    submittedAt: new Date().toISOString()
  };

  quizState.leaderboard.push(entry);
  quizState.participants[entry.id] = { name: entry.name, avatar: entry.avatar };
  saveLocalState();
  await db.saveSubmissionToDb(entry);

  // Broadcast live scoreboard update to all displays
  broadcast({
    type: 'LEADERBOARD_UPDATE',
    leaderboard: quizState.leaderboard.sort((a, b) => b.score - a.score || a.totalTimeSec - b.totalTimeSec),
    newEntry: entry
  });

  res.json({
    success: true,
    entry,
    detailedResults,
    rank: quizState.leaderboard.sort((a, b) => b.score - a.score || a.totalTimeSec - b.totalTimeSec).findIndex(e => e.id === entry.id) + 1
  });
});

// WebSocket real-time handling
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    state: getPublicState(),
    localIp: getLocalIP(),
    port: PORT
  }));

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'ADMIN_ACTION') {
        const { password, action, payload } = data;
        if (password !== quizState.adminPassword) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Unauthorized: Wrong admin password' }));
          return;
        }

        await executeAdminAction(action, payload);
        ws.send(JSON.stringify({ type: 'ADMIN_ACTION_SUCCESS', action }));
      }

      if (data.type === 'PARTICIPANT_JOIN') {
        const { name, avatar } = data;
        const participantId = 'p_' + Date.now();
        quizState.participants[participantId] = { name, avatar };
        broadcast({
          type: 'PARTICIPANT_COUNT',
          count: Object.keys(quizState.participants).length
        });
      }

    } catch (err) {
      console.error('[WS] Error parsing message:', err);
    }
  });
});

// Initialize DB and launch server
initializeDatabaseState().finally(() => {
  server.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalIP();
    console.log(`====================================================`);
    console.log(`🚀 WF Club Open Day Quiz Platform is LIVE!`);
    console.log(`🔗 Local Access:    http://localhost:${PORT}`);
    console.log(`📱 Phone Access:    http://${localIp}:${PORT}`);
    console.log(`🔑 Admin Password:  ${quizState.adminPassword}`);
    console.log(`💾 Database:        ${db.getDbStatus().isConnected ? 'Supabase PostgreSQL' : 'Local Persistence (Pending DB Password)'}`);
    console.log(`====================================================`);
  });
});
