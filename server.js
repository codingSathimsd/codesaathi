const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ── Your Anthropic API key comes from Railway environment variable ──
const API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Health check — visiting your Railway URL shows this ──
app.get("/", (req, res) => {
  res.send("CodeSaathi backend is live! 🚀");
});

// ── Main chat endpoint — frontend sends messages here ──
app.post("/chat", async (req, res) => {
  const { messages, system } = req.body;

  if (!messages || !system) {
    return res.status(400).json({ error: "Missing messages or system prompt" });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: "API key not set in Railway environment variables" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        system: system,
        messages: messages,
      }),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: data.error.message });
    }

    res.json({ reply: data.content[0].text });

  } catch (err) {
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

// ── Start server ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CodeSaathi server running on port ${PORT}`);
});
                                 
