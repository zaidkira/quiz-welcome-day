# 🚀 WF Club • Open Day Interactive Quiz & Live Leaderboard

A website created for your club's **Open Day event**, themed with your **club logo's colors** (cyber electric cyan, deep tech navy, sky blue, and neon glow).

---

## ✨ Features

1. **🎨 Custom Club Design & Aesthetics**:
   - Modern cyber glassmorphism design matching the logo's color palette (`#00d2ff`, `#0072ff`, `#38bdf8`, dark tech navy).
   - Animated circuit grid background, pulsing logo badge, and interactive hover effects.
   - Built-in **sound synthesizer** (Web Audio API) for button clicks, countdown ticks, correct/wrong sound chimes, and victory fanfares (zero external audio files needed!).
   - Dynamic **confetti celebration** on quiz completion and when a new participant takes 1st place!

2. **🐘 Supabase Cloud Database Sync**:
   - Connects to your Supabase PostgreSQL database:
     `postgresql://postgres.bzaxtopopollapplqyhv:[YOUR-PASSWORD]@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`
   - Automatically initializes `quiz_config`, `quiz_questions`, and `quiz_submissions` tables.
   - You can enter your database password directly in the **Admin Panel** or in the [`.env`](file:///c:/Users/kira/Downloads/quiz/.env) file.
   - Includes graceful offline/local fallback so the website works immediately even before entering your Supabase password.

3. **📝 Live Question Customization in Admin**:
   - Admin can edit all 10 questions and their 4 choices directly from the browser!
   - Change question text, option texts, and click **"Set as Correct"** to pick the right answer (highlighted in bright green).
   - Change per-question time limits or add custom explanations/fun facts.
   - Click **"💾 Save This Question"** or **"💾 Save All Questions"** to sync instantly across all participant devices and the cloud database.
   - Add new questions or restore the default 10 Open Day questions at any time.

4. **🏆 100% Live Scoreboard ("The Board")**:
   - Real-time WebSocket sync + 2.5-second auto-polling backup.
   - **Top 3 Podium** (🥇 1st Place Champion with Crown, 🥈 2nd Place, 🥉 3rd Place) with animated avatars, scores, and accuracy.
   - Instant rank shift animations, sound chimes, and confetti when a new player takes #1.
   - **QR Code & Network Link Banner**: Auto-generates a QR code and network URL so visitors at the booth can join directly from their smartphones!
   - Fullscreen button (⛶) for projecting on a TV or big screen.
   - **"⚡ Simulate Player"** button in Admin: Instantly tests the live board with sample entries to verify live animations and audio.

5. **⚡ Admin Control Center**:
   - Protected by admin password (default: **`admin`**).
   - **Start Quiz Round**: Moves the quiz from waiting state to live, triggering question 1 for all participants.
   - **End Quiz Round**: Locks submissions and announces final winners on the leaderboard.
   - **Reset Session**: Clears waiting room for the next round of visitors.
   - **Clear All Scores**: Cleans the leaderboard between sessions.
   - **Export CSV**: Download rankings spreadsheet with participant names, scores, and timestamps for distributing prizes!

---

## 🚀 How to Run the Website

### 1. Start the Server
Open a terminal in the project folder and run:
```bash
npm start
```
*(Or `node server.js`)*

### 2. Connect Your Supabase Database
You have two easy ways to set your Supabase database password:
- **Option A (In the browser)**: Open [http://localhost:3000](http://localhost:3000) -> Go to **Admin Panel** (password `admin`) -> Under **🐘 Supabase PostgreSQL Database**, enter your password and click **Connect & Sync Supabase**!
- **Option B (In `.env` file)**: Open [`.env`](file:///c:/Users/kira/Downloads/quiz/.env) and replace `[YOUR-PASSWORD]` with your actual Supabase database password.

### 3. Open on Screen & Phones
- **Big Screen / Projector**: Open `http://localhost:3000` -> Click **Live Board** tab -> Click Fullscreen (⛶).
- **Visitors' Phones**: Scan the QR code shown on the Live Board banner or enter `http://<your-ip>:3000`.
- **Admin Control**: Open `http://localhost:3000` -> Click **Admin Panel** -> Click **Start Quiz Now** when ready!

---

## 📁 Project Structure

```
quiz/
├── public/
│   ├── index.html       # Single-Page App (Quiz, Live Board, Admin)
│   ├── style.css        # Cyber aesthetic design with club logo colors
│   ├── app.js           # Client sync engine, Question Editor, Web Audio SFX & Confetti
│   └── logo.png         # Your club logo
├── server.js            # Node.js + Express + WebSocket live sync server
├── db.js                # Supabase PostgreSQL connection & auto-table migration
├── .env                 # Database credentials & environment variables
├── quiz-data.json       # Local fallback persistent storage
└── package.json         # Project configuration & dependencies
```
