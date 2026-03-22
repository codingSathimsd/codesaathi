const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Your Groq API key from Render environment variable ──
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ── Health check ──
app.get("/", (req, res) => {
  res.send("CodeSaathi backend is live! 🚀");
});

// ── Main chat endpoint ──
app.post("/chat", async (req, res) => {
  const { messages, system } = req.body;

  if (!messages || !system) {
    return res.status(400).json({ error: "Missing messages or system prompt" });
  }

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not set in environment variables" });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        max_tokens: 1024,
        messages: [
          { role: "system", content: system },
          ...messages,
        ],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    res.json({ reply: data.choices[0].message.content });

  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ── Start server ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("CodeSaathi server running on port " + PORT);
});
