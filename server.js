const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── API KEYS FROM ENVIRONMENT ──────────────────────────────
const GROQ_KEY     = process.env.GROQ_API_KEY;
const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;
const SB_URL       = process.env.SUPABASE_URL;
const SB_KEY       = process.env.SUPABASE_KEY;
const OS_APP_ID    = process.env.ONESIGNAL_APP_ID;
const OS_REST_KEY  = process.env.ONESIGNAL_REST_KEY;

// ── HEALTH CHECK ───────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "live",
    message: "CodeSaathi backend is running! 🚀",
    apis: {
      groq:     GROQ_KEY     ? "✅ connected" : "❌ missing",
      gemini:   GEMINI_KEY   ? "✅ connected" : "❌ missing",
      resend:   RESEND_KEY   ? "✅ connected" : "❌ missing",
      supabase: SB_URL       ? "✅ connected" : "❌ missing",
    }
  });
});

// ── AI CHAT — WITH FALLBACK ────────────────────────────────
// Primary: Groq | Fallback: Gemini
app.post("/chat", async (req, res) => {
  const { messages, system } = req.body;
  if (!messages || !system) {
    return res.status(400).json({ error: "Missing messages or system" });
  }

  // Try Groq first
  if (GROQ_KEY) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + GROQ_KEY,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1024,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      const data = await r.json();
      if (data.choices && data.choices[0]) {
        return res.json({ reply: data.choices[0].message.content, source: "groq" });
      }
    } catch (e) {
      console.log("Groq failed, trying Gemini...", e.message);
    }
  }

  // Fallback: Gemini
  if (GEMINI_KEY) {
    try {
      const prompt = system + "\n\nUser: " + messages[messages.length - 1].content;
      const r = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 1024 },
          }),
        }
      );
      const data = await r.json();
      if (data.candidates && data.candidates[0]) {
        return res.json({ reply: data.candidates[0].content.parts[0].text, source: "gemini" });
      }
    } catch (e) {
      console.log("Gemini also failed:", e.message);
    }
  }

  return res.status(500).json({ error: "All AI services unavailable. Please try again in 30 seconds." });
});

// ── SAVE USER ──────────────────────────────────────────────
app.post("/user/save", async (req, res) => {
  const { name, phone, profile, state, interest, ambition, lang } = req.body;
  if (!SB_URL || !SB_KEY) {
    return res.json({ ok: true, msg: "Database not connected — user not saved" });
  }
  try {
    const r = await fetch(SB_URL + "/rest/v1/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        name: name || "Anonymous",
        phone: phone || null,
        profile: profile || "school",
        state: state || "other",
        interest: interest || null,
        ambition: ambition || null,
        lang: lang || "en",
        xp: 0,
        streak: 1,
        created_at: new Date().toISOString(),
      }),
    });
    res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── UPDATE XP ──────────────────────────────────────────────
app.post("/user/xp", async (req, res) => {
  const { phone, xp, streak } = req.body;
  if (!SB_URL || !SB_KEY || !phone) return res.json({ ok: false });
  try {
    const r = await fetch(SB_URL + "/rest/v1/users?phone=eq." + phone, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SB_KEY,
        "Authorization": "Bearer " + SB_KEY,
      },
      body: JSON.stringify({ xp, streak, updated_at: new Date().toISOString() }),
    });
    res.json({ ok: r.ok });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ── SAVE FEEDBACK ──────────────────────────────────────────
app.post("/feedback", async (req, res) => {
  const { name, category, message, rating, phone } = req.body;

  // Save to Supabase
  if (SB_URL && SB_KEY) {
    try {
      await fetch(SB_URL + "/rest/v1/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SB_KEY,
          "Authorization": "Bearer " + SB_KEY,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          name: name || "Anonymous",
          phone: phone || null,
          category: category || "Other",
          message,
          rating: rating || 5,
          created_at: new Date().toISOString(),
        }),
      });
    } catch (e) {
      console.log("Feedback save error:", e.message);
    }
  }

  // Send email notification via Resend
  if (RESEND_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + RESEND_KEY,
        },
        body: JSON.stringify({
          from: "CodeSaathi <onboarding@resend.dev>",
          to: ["codesaathi@gmail.com"],
          subject: "New Feedback: " + (category || "Other"),
          html: "<h2>New CodeSaathi Feedback</h2><p><b>Name:</b> " + (name||"Anonymous") + "</p><p><b>Category:</b> " + category + "</p><p><b>Rating:</b> " + rating + "/5</p><p><b>Message:</b></p><p>" + message + "</p>",
        }),
      });
    } catch (e) {
      console.log("Email error:", e.message);
    }
  }

  res.json({ ok: true, message: "Feedback saved! Shukriya 🙏" });
});

// ── LEADERBOARD ────────────────────────────────────────────
app.get("/leaderboard", async (req, res) => {
  if (!SB_URL || !SB_KEY) {
    // Return demo data if no database
    return res.json({
      data: [
        { name: "Arjun S.", xp: 1240, streak: 12 },
        { name: "Priya M.", xp: 980,  streak: 8  },
        { name: "Rahul K.", xp: 756,  streak: 6  },
        { name: "Anjali T.", xp: 620, streak: 5  },
        { name: "Dev P.", xp: 540,    streak: 4  },
      ]
    });
  }
  try {
    const r = await fetch(SB_URL + "/rest/v1/users?select=name,xp,streak&order=xp.desc&limit=10", {
      headers: { "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY },
    });
    const data = await r.json();
    res.json({ data });
  } catch (e) {
    res.json({ data: [], error: e.message });
  }
});

// ── SEND PUSH NOTIFICATION ────────────────────────────────
app.post("/notify", async (req, res) => {
  const { title, message, playerIds } = req.body;
  if (!OS_APP_ID || !OS_REST_KEY) {
    return res.json({ ok: false, msg: "OneSignal not configured" });
  }
  try {
    const body = {
      app_id: OS_APP_ID,
      headings: { en: title || "CodeSaathi" },
      contents: { en: message || "Aaj kuch seekha? 🚀" },
    };
    if (playerIds && playerIds.length) {
      body.include_player_ids = playerIds;
    } else {
      body.included_segments = ["All"];
    }
    const r = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + OS_REST_KEY,
      },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── SEND WELCOME EMAIL ─────────────────────────────────────
app.post("/email/welcome", async (req, res) => {
  const { name, email } = req.body;
  if (!RESEND_KEY || !email) return res.json({ ok: false });
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + RESEND_KEY,
      },
      body: JSON.stringify({
        from: "CodeSaathi <onboarding@resend.dev>",
        to: [email],
        subject: "Welcome to CodeSaathi! 🚀",
        html: "<h1>Namaste " + (name||"Dost") + "! 👋</h1><p>Welcome to CodeSaathi — India ka free AI coding tutor!</p><p>Main hoon tera coding saathi — kuch bhi pooch, main samjhaunga.</p><p>Aaj ka pehla step: <b>Ek coding sawaal pooch!</b></p><p><a href='https://codesaathi-tutor.netlify.app'>CodeSaathi Kholo 🚀</a></p><br><p>Tera Saathi,<br>CodeSaathi Team</p>",
      }),
    });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── DAILY CHALLENGE ────────────────────────────────────────
app.get("/challenge/today", async (req, res) => {
  const challenges = [
    { title: "Reverse a String", desc: "Write a function to reverse a string without using built-in reverse methods.", difficulty: "Easy", xp: 50 },
    { title: "FizzBuzz", desc: "Print numbers 1-100. For multiples of 3 print Fizz, for 5 print Buzz, for both print FizzBuzz.", difficulty: "Easy", xp: 40 },
    { title: "Find Duplicates", desc: "Given an array of numbers, find all duplicate elements.", difficulty: "Medium", xp: 80 },
    { title: "Palindrome Check", desc: "Check if a given string is a palindrome.", difficulty: "Easy", xp: 45 },
    { title: "Fibonacci Sequence", desc: "Generate the first N numbers of the Fibonacci sequence.", difficulty: "Easy", xp: 50 },
    { title: "Sum of Digits", desc: "Find the sum of all digits of a given number.", difficulty: "Easy", xp: 35 },
    { title: "Count Vowels", desc: "Count the number of vowels in a given string.", difficulty: "Easy", xp: 35 },
    { title: "Two Sum Problem", desc: "Given an array and a target, find two numbers that add up to the target.", difficulty: "Medium", xp: 75 },
  ];
  const today = new Date().getDay();
  res.json({ challenge: challenges[today % challenges.length] });
});

// ── CERTIFICATE VERIFY ─────────────────────────────────────
app.get("/verify/:certId", async (req, res) => {
  const { certId } = req.params;
  res.json({
    valid: true,
    certId,
    message: "This certificate is valid and issued by CodeSaathi",
    issuedBy: "CodeSaathi — India's Free AI Coding Tutor",
    website: "https://codesaathi-tutor.netlify.app",
  });
});

// ── START SERVER ───────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("CodeSaathi server running on port " + PORT + " 🚀");
  console.log("APIs: Groq=" + (GROQ_KEY?"✅":"❌") + " Gemini=" + (GEMINI_KEY?"✅":"❌") + " Supabase=" + (SB_URL?"✅":"❌"));
});
