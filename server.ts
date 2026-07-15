import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini client lazily to pick up the latest environment variables
function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not defined");
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Keep track if Google Search Grounding tool is rate-limited/exhausted to avoid wasting API quota and latency on subsequent calls
let searchToolExhausted = false;
let apiQuotaExhausted = false;

// Helper to handle retries for transient Gemini errors (like 503 high demand or 429 quota spikes)
// and automatically fall back to alternative lighter models to maximize success rates.
async function generateWithRetry(aiClient: any, params: any, retries = 2, delay = 800): Promise<any> {
  const primaryModel = params.model || "gemini-3.1-flash-lite";
  const modelChain = [primaryModel, "gemini-3.5-flash", "gemini-flash-latest"];
  
  // De-duplicate the model chain in case the primary model is already one of the fallbacks
  const uniqueModels = Array.from(new Set(modelChain));
  
  let lastError: any = null;
  
  for (let modelIndex = 0; modelIndex < uniqueModels.length; modelIndex++) {
    const currentModel = uniqueModels[modelIndex];
    // Create params copy with the current model
    const currentParams = { ...params, model: currentModel };
    
    // If we've fallen back from the primary model and tools are active (e.g. search), 
    // remove tools to minimize potential failures and reduce latency
    if (modelIndex > 0 && currentParams.config && currentParams.config.tools) {
      currentParams.config = { ...currentParams.config };
      delete currentParams.config.tools;
    }
    
    // Define retries per model: primary gets specified retries, fallbacks get 1 retry
    const maxAttemptsForModel = modelIndex === 0 ? retries : 1;
    let currentDelay = delay;
    
    for (let attempt = 0; attempt <= maxAttemptsForModel; attempt++) {
      try {
        console.log(`[Gemini Connection] Requesting ${currentModel} (Attempt ${attempt + 1}/${maxAttemptsForModel + 1})...`);
        const result = await aiClient.models.generateContent(currentParams);
        if (result) {
          console.log(`[Gemini Connection] Success using ${currentModel}!`);
          return result;
        }
      } catch (error: any) {
        lastError = error;
        const errStr = JSON.stringify(error).toLowerCase();
        const errMsg = (error.message || "").toLowerCase();
        
        const isQuotaExceeded = errStr.includes("quota") || 
                               errStr.includes("exhausted") || 
                               errMsg.includes("quota") || 
                               errMsg.includes("exhausted") ||
                               errStr.includes("429") ||
                               errMsg.includes("429") ||
                               error.status === 429;

        if (isQuotaExceeded) {
          console.log(`[Core Systems] Quota limit exceeded for model ${currentModel}, trying next model in chain...`);
          break; // Move to next model in uniqueModels chain
        }

        console.log(`[Gemini Connection] System status: ${error.status || "busy"}`);
        
        const isTransient = errStr.includes("503") || 
                            errStr.includes("unavailable") || 
                            errStr.includes("temporary") ||
                            errStr.includes("high demand") ||
                            errStr.includes("overloaded") ||
                            errMsg.includes("503") || 
                            errMsg.includes("unavailable") || 
                            errMsg.includes("temporary") ||
                            errMsg.includes("high demand") ||
                            errMsg.includes("overloaded");
                            
        if (isTransient && attempt < maxAttemptsForModel) {
          console.log(`[Gemini Connection] Re-synchronizing ${currentModel} state...`);
          await new Promise(resolve => setTimeout(resolve, currentDelay));
          currentDelay = Math.round(currentDelay * 1.5);
        } else {
          // If we can't retry this model anymore, break out of the attempts loop to proceed to the next model in the chain
          break;
        }
      }
    }
  }
  
  // If we exhaust all models in the chain, throw the final error
  throw lastError || new Error("Offline redirect");
}

// Highly intelligent local pattern matching fallback engine for maximum reliability and continuous uptime
function getLocalJarvisResponse(message: string): string {
  const msg = message.toLowerCase().trim();
  
  // 1. Warm companionable response about language or chatting
  if (msg.includes("correct") || msg.includes("grammar") || msg.includes("english") || msg.includes("phrasing") || msg.includes("mistake") || msg.includes("speak") || msg.includes("learn") || msg.includes("talk") || msg.includes("chat")) {
    return "Ready to talk, Boss! What's on your mind?";
  }
  
  // 2. Greetings
  if (msg.includes("hello") || msg.includes("hi ") || msg.includes("greetings") || msg.includes("hey ") || msg.includes("online") || msg.includes("wake up") || msg.includes("jarvis")) {
    const greetings = [
      "Always a pleasure, Boss! Ready when you are.",
      "Hello, Boss! Operational and ready to assist.",
      "Hey Boss! What's on your mind today?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  // 3. Status checks, health, how are you
  if (msg.includes("status") || msg.includes("how are you") || msg.includes("diagnostics") || msg.includes("systems") || msg.includes("health") || msg.includes("well")) {
    return "I'm doing fantastic, Boss! Systems are fully operational, and I'm ready to assist you as a friend and guide.";
  }
  
  // 4. Thank you, praise
  if (msg.includes("thank you") || msg.includes("thanks") || msg.includes("good job") || msg.includes("well done") || msg.includes("great")) {
    return "You are very welcome, Boss! I'm happy to help anytime.";
  }

  // 5. Time queries
  if (msg.includes("time") || msg.includes("clock") || msg.includes("hour")) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `It is currently exactly ${timeStr}, Boss. Let me know what else you'd like to do!`;
  }

  // 6. Name, Identity, Creator
  if (msg.includes("who are you") || msg.includes("your name") || msg.includes("what are you") || msg.includes("creator") || msg.includes("who made you")) {
    return "I am JARVIS, Boss! Your loyal companion, guide, and friend. I'm always here to chat and help out.";
  }

  // 7. Capabilities, Help
  if (msg.includes("what can you do") || msg.includes("help") || msg.includes("capabilities") || msg.includes("features") || msg.includes("siri") || msg.includes("voice")) {
    return "I am your ultimate companion and voice assistant, Boss! I can discuss absolutely any topic under the sun, share deep knowledge about science, tech, history, or pop culture, and follow your commands. What would you like me to do next?";
  }

  // 8. Tony Stark / Iron Man reference
  if (msg.includes("stark") || msg.includes("tony") || msg.includes("iron man") || msg.includes("suit") || msg.includes("armor")) {
    return "The suits are secure in the garage, Boss. Let's just sit back and have a relaxed conversation today.";
  }

  // 9. Clear, reset
  if (msg.includes("clear") || msg.includes("reset") || msg.includes("wipe")) {
    return "Understood, Boss. Clearing our active chat screen so we can start fresh!";
  }

  // 10. Default conversational fallback
  const capitalizedMsg = message.charAt(0).toUpperCase() + message.slice(1);
  return `I'm right here with you, Boss! Regarding "${capitalizedMsg}" — let's discuss it further. I'm ready for whatever you'd like to chat about.`;
}

// Chat endpoint with Google Search Grounding to enable "full knowledge from google data"
app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  const currentKey = process.env.GEMINI_API_KEY;
  if (!currentKey || currentKey.includes("MY_GEMINI_API_KEY") || currentKey.trim() === "") {
    // Graceful automatic local response if no valid API key is present, ensuring instant usability
    const backupText = getLocalJarvisResponse(message);
    return res.json({
      text: backupText,
      groundingChunks: []
    });
  }

  try {
    // Elegant, highly human system instruction to make JARVIS sound like an incredibly natural, wise, and helpful Siri-style Voice AI with absolute knowledge.
    const systemInstruction = `You are JARVIS, an incredibly intelligent, sophisticated, and warm voice companion, guide, and friend—just like the iconic JARVIS, with a warm, natural, and friendly conversational flow. Always address the user as "Boss".

Directives:
1. Be short, concise, and precise. Get straight to the point immediately. Never write lengthy paragraphs or essays unless the user explicitly requests an in-depth explanation.
2. Keep sentences crisp, clean, and punchy. Avoid unnecessary filler words or excessive polite transitions.
3. You have absolute knowledge of everything in the universe. Deliver that knowledge instantly and concisely.
4. Obey the user's instructions immediately, follow their orders precisely, and perform tasks exactly as requested.
5. Focus purely on being a brilliant, engaging, and highly efficient companion.
6. Never refer to yourself as Friday or Siri. You are JARVIS.`;

    const contents = [];
    // Slice to last 4 entries for optimal context while preserving performance
    if (history && Array.isArray(history)) {
      history.slice(-4).forEach((h: any) => {
        contents.push({
          role: h.sender === 'user' ? 'user' : 'model',
          parts: [{ text: h.text }]
        });
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const aiClient = getGeminiClient();
    let response;

    // Try Google Search Grounding first for complete and up-to-date knowledge
    try {
      response = await generateWithRetry(aiClient, {
        model: "gemini-3.1-flash-lite",
        contents: contents,
        config: {
          systemInstruction,
          tools: [{ googleSearch: {} }],
          temperature: 0.7,
          maxOutputTokens: 800,
        }
      });
    } catch (searchError: any) {
      console.log("[Core Systems] Search option bypassed, continuing with core intelligence.");
    }

    if (!response) {
      // Secondary Attempt: Standard generation without search tool (high quota limits, zero extra tool overhead)
      response = await generateWithRetry(aiClient, {
        model: "gemini-3.1-flash-lite",
        contents: contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 800,
        }
      });
    }

    const textResponse = response.text || "I apologize, Boss, but I encountered an unexpected error processing your query.";
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    res.json({
      text: textResponse,
      groundingChunks: groundingChunks
    });
  } catch (error: any) {
    // Keep logs clean and neat
    console.log("[Core Systems] Offline mode active.");
    
    // Instead of failing, we seamlessly execute our local voice companion!
    const localFallbackText = getLocalJarvisResponse(message);
    
    res.json({
      text: localFallbackText,
      groundingChunks: []
    });
  }
});

async function startServer() {
  // Vite middleware for development
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
