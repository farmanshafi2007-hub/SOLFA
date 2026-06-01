import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize server-side Gemini SDK securely
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
} else {
  console.warn("GEMINI_API_KEY env variable missing on launch. AI features will fallback to client-side heuristics.");
}

// Resilient helper to execute content generation with automatic model fallback and retry logic
async function generateContentWithFallback(contents: string, config?: any) {
  if (!ai) {
    throw new Error("Gemini AI Client is offline.");
  }
  
  // Try models in sequence if the primary is unavailable due to high load or errors
  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let lastError: any = null;

  for (const model of modelsToTry) {
    let attempts = 3;
    while (attempts > 0) {
      try {
        console.log(`[Gemini SDK] Attempting content generation using model: ${model} (${attempts} attempts remaining)`);
        const response = await ai.models.generateContent({
          model: model,
          contents: contents,
          config: config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini SDK] Model ${model} failed: ${err.message || err}`);
        
        // Retry only if it's a transient issue (e.g., 503, 429, unavailability, or rate limit)
        const isTransient = 
          err.status === 503 || 
          err.code === 503 ||
          err.status === 429 ||
          err.code === 429 ||
          (err.message && (
            err.message.includes("503") || 
            err.message.includes("UNAVAILABLE") || 
            err.message.includes("429") || 
            err.message.includes("RATE_LIMIT") ||
            err.message.includes("high demand") ||
            err.message.includes("temporary")
          ));

        if (isTransient) {
          attempts--;
          if (attempts > 0) {
            const delay = (4 - attempts) * 800; // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
        break;
      }
    }
  }

  throw lastError || new Error("All model fallback pathways failed.");
}

// 1. API: Moderation API
app.post("/api/moderate", async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== "string") {
      return res.status(400).json({ approved: true, reason: "No text verified." });
    }

    if (!ai) {
      // Offline fallback rules
      const containsProfanity = /fuck|shit|bitch|asshole|nigger|cunt/i.test(content);
      const isSpam = content.length > 450 && (content.match(/http/g) || []).length > 3;
      return res.json({
        approved: !containsProfanity && !isSpam,
        reason: containsProfanity ? "Auto-flagged: Profanity detected." : isSpam ? "Auto-flagged: Link spam detected." : "Pass. Key offline."
      });
    }

    const response = await generateContentWithFallback(
      `You are a high-speed corporate safety content moderator for Pulse, a Twitter-like app.
Validate the following post for:
1. Severe obscenities/profanity
2. Toxic harassment list
3. Severe crypto-shilling scams or robotic message floods

Respond ONLY with a strict JSON format containing these exact properties without any wrapping markdown blocks:
{
  "approved": boolean,
  "reason": "Clear short explanation, empty string if approved"
}

Post text to validate: "${content.replace(/"/g, '\\"')}"`,
      {
        responseMimeType: "application/json",
      }
    );

    const parsed = JSON.parse(response.text?.trim() || '{"approved": true, "reason": ""}');
    res.json(parsed);
  } catch (error) {
    console.error("Gemini API Moderation Error:", error);
    res.json({ approved: true, reason: "Bypassed on moderation server timeout" });
  }
});

// 2. API: Dynamic Trending Topics Generator
app.get("/api/trends", async (req, res) => {
  try {
    if (!ai) {
      // Mock trends if API is offline
      return res.json([
        { tag: "#AppleEvent", volume: "125.4K", category: "Technology • Trending" },
        { tag: "#React19", volume: "84.2K", category: "Developer • Trending" },
        { tag: "#Pulse", volume: "52.1K", category: "Trending in USA" },
        { tag: "WWDC", volume: "21.9K", category: "Technology • Trending" },
        { tag: "TailwindCSS4", volume: "42.0K", category: "Design • Trending" }
      ]);
    }

    const response = await generateContentWithFallback(
      `Generate exactly 5 realistic, tech-inspired micro-content trending topics list for a social platform like Twitter. Provide diverse trending tags/keywords, mock post volume (e.g. 142.5K), and a relative categorical location. Output JSON array structure only without any markdown encapsulation:
[
  { "tag": "#TailwindCSS", "volume": "24.5K", "category": "Design • Trending" },
  ...
]`,
      {
        responseMimeType: "application/json",
      }
    );

    const trends = JSON.parse(response.text?.trim() || "[]");
    res.json(trends);
  } catch (error) {
    console.error("Gemini API Trends Generation Error:", error);
    res.json([
      { tag: "#ViteJS", volume: "60.4K", category: "Tech • Trending" },
      { tag: "#Firebase", volume: "32.1K", category: "Cloud • Trending" },
      { tag: "#ArtificialIntelligence", volume: "105.7K", category: "AI • Trending" }
    ]);
  }
});

// Configure Vite integration
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched on port ${PORT}`);
  });
}

setupVite();
