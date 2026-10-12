require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;
let isConnected = false;
let lastDbError = null;
let currentConnectionString = process.env.DATABASE_URL || '';

function sanitizeConnectionString(url) {
  if (!url) return '';
  return url.trim();
}

function isPlaceholderPassword(url) {
  if (!url) return true;
  return url.includes('[YOUR-PASSWORD]') || url.includes('YOUR_PASSWORD') || url.includes('password_here');
}

async function initDb(connectionStringOverride = null) {
  const connStr = sanitizeConnectionString(connectionStringOverride || currentConnectionString);
  currentConnectionString = connStr;

  if (!connStr || isPlaceholderPassword(connStr)) {
    isConnected = false;
    lastDbError = 'Supabase password not set yet. Please provide your Supabase database password in .env or via Admin Panel.';
    console.log('[DB] Notice:', lastDbError);
    return false;
  }

  try {
    if (pool) {
      await pool.end().catch(() => {});
    }

    pool = new Pool({
      connectionString: connStr,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000,
      max: 10
    });

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    isConnected = true;
    lastDbError = null;
    console.log('✅ [DB] Successfully connected to Supabase PostgreSQL!');

    // Initialize tables
    await createTablesIfNotExist();
    return true;
  } catch (err) {
    isConnected = false;
    lastDbError = err.message || 'Failed to connect to PostgreSQL database.';
    console.error('❌ [DB] Supabase connection error:', lastDbError);
    return false;
  }
}

async function createTablesIfNotExist() {
  if (!isConnected || !pool) return;
  try {
    const client = await pool.connect();

    // 1. Config table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quiz_config (
        id VARCHAR(50) PRIMARY KEY,
        status VARCHAR(50) NOT NULL DEFAULT 'not_started',
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        time_per_question INT DEFAULT 20,
        admin_password VARCHAR(100) DEFAULT 'admin',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Questions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_answer INT NOT NULL DEFAULT 0,
        time_limit INT DEFAULT 20,
        explanation TEXT DEFAULT '',
        order_index INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 3. Submissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS quiz_submissions (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        avatar VARCHAR(50) DEFAULT '🚀',
        score INT NOT NULL DEFAULT 0,
        correct_count INT NOT NULL DEFAULT 0,
        total_questions INT NOT NULL DEFAULT 10,
        total_time_sec INT NOT NULL DEFAULT 0,
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    client.release();
    console.log('✅ [DB] Supabase tables verified/created successfully.');
  } catch (err) {
    console.error('❌ [DB] Error creating tables:', err.message);
  }
}

// ----------------------------------------------------
// DATABASE SYNC METHODS
// ----------------------------------------------------

async function loadConfigFromDb() {
  if (!isConnected || !pool) return null;
  try {
    const res = await pool.query('SELECT * FROM quiz_config WHERE id = $1', ['default']);
    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        timePerQuestion: row.time_per_question,
        adminPassword: row.admin_password
      };
    }
  } catch (err) {
    console.error('[DB] loadConfigFromDb error:', err.message);
  }
  return null;
}

async function saveConfigToDb(config) {
  if (!isConnected || !pool) return;
  try {
    await pool.query(`
      INSERT INTO quiz_config (id, status, started_at, ended_at, time_per_question, admin_password, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        started_at = EXCLUDED.started_at,
        ended_at = EXCLUDED.ended_at,
        time_per_question = EXCLUDED.time_per_question,
        admin_password = EXCLUDED.admin_password,
        updated_at = NOW();
    `, [
      'default',
      config.status || 'not_started',
      config.startedAt || null,
      config.endedAt || null,
      config.timePerQuestion || 20,
      config.adminPassword || '7nahomawaves'
    ]);
  } catch (err) {
    console.error('[DB] saveConfigToDb error:', err.message);
  }
}

async function loadQuestionsFromDb() {
  if (!isConnected || !pool) return null;
  try {
    const res = await pool.query('SELECT * FROM quiz_questions ORDER BY order_index ASC, id ASC');
    if (res.rows.length > 0) {
      return res.rows.map(r => ({
        id: r.id,
        question: r.question,
        options: Array.isArray(r.options) ? r.options : JSON.parse(r.options),
        correctAnswer: r.correct_answer,
        timeLimit: r.time_limit,
        explanation: r.explanation || ''
      }));
    }
  } catch (err) {
    console.error('[DB] loadQuestionsFromDb error:', err.message);
  }
  return null;
}

async function saveQuestionsToDb(questions) {
  if (!isConnected || !pool || !Array.isArray(questions)) return;
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM quiz_questions');

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await client.query(`
          INSERT INTO quiz_questions (question, options, correct_answer, time_limit, explanation, order_index)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          q.question,
          JSON.stringify(q.options),
          q.correctAnswer || 0,
          q.timeLimit || 20,
          q.explanation || '',
          i
        ]);
      }

      await client.query('COMMIT');
      console.log(`✅ [DB] Saved ${questions.length} questions to Supabase.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[DB] saveQuestionsToDb error:', err.message);
  }
}

async function loadLeaderboardFromDb() {
  if (!isConnected || !pool) return null;
  try {
    const res = await pool.query('SELECT * FROM quiz_submissions ORDER BY score DESC, total_time_sec ASC');
    return res.rows.map(r => ({
      id: r.id,
      name: r.name,
      avatar: r.avatar,
      score: r.score,
      correctCount: r.correct_count,
      totalQuestions: r.total_questions,
      totalTimeSec: r.total_time_sec,
      submittedAt: r.submitted_at
    }));
  } catch (err) {
    console.error('[DB] loadLeaderboardFromDb error:', err.message);
  }
  return null;
}

async function saveSubmissionToDb(entry) {
  if (!isConnected || !pool) return;
  try {
    await pool.query(`
      INSERT INTO quiz_submissions (id, name, avatar, score, correct_count, total_questions, total_time_sec, submitted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        score = EXCLUDED.score,
        correct_count = EXCLUDED.correct_count,
        total_time_sec = EXCLUDED.total_time_sec;
    `, [
      entry.id,
      entry.name,
      entry.avatar || '🚀',
      entry.score,
      entry.correctCount,
      entry.totalQuestions,
      entry.totalTimeSec,
      entry.submittedAt || new Date().toISOString()
    ]);
  } catch (err) {
    console.error('[DB] saveSubmissionToDb error:', err.message);
  }
}

async function deleteSubmissionFromDb(id) {
  if (!isConnected || !pool) return;
  try {
    await pool.query('DELETE FROM quiz_submissions WHERE id = $1', [id]);
  } catch (err) {
    console.error('[DB] deleteSubmissionFromDb error:', err.message);
  }
}

async function clearLeaderboardFromDb() {
  if (!isConnected || !pool) return;
  try {
    await pool.query('DELETE FROM quiz_submissions');
  } catch (err) {
    console.error('[DB] clearLeaderboardFromDb error:', err.message);
  }
}

function getDbStatus() {
  return {
    isConnected,
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.bzaxtopopollapplqyhv',
    hasPassword: !isPlaceholderPassword(currentConnectionString),
    error: lastDbError
  };
}

module.exports = {
  initDb,
  getDbStatus,
  loadConfigFromDb,
  saveConfigToDb,
  loadQuestionsFromDb,
  saveQuestionsToDb,
  loadLeaderboardFromDb,
  saveSubmissionToDb,
  deleteSubmissionFromDb,
  clearLeaderboardFromDb
};
