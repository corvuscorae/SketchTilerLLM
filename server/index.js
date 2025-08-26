import express from "express";
import multer from "multer";
import { OpenAI } from "openai";
import { v4 as uuid } from "uuid";
import { getOrCreateThread, appendMessage } from "./memory.js";
import "dotenv/config";

const app = express();
const upload = multer();            // for image uploads (multipart/form-data)
app.use(express.json({ limit: "10mb" }));

// 1) init OpenAI client
const openai = new OpenAI({apiKey: process.env.OPENAI_API_KEY });

// 2) A single system prompt for SketchTiler “agent”
const SKETCHTILER_SYSTEM = `
You are SketchTiler Assistant. Goal: assist with ideation and editing for tile-based level sketches.
Be proactive: propose changes, ask clarifying questions, and produce structured action plans.
When given images of maps/tiles, describe salient features and suggest improvements.
When asked, output actionable JSON of proposed edits.
`;

// 3) Send a text message (persistent thread by projectId)
app.post("/api/chat", async (req, res) => {
  try {
    const { projectId = "sketchtiler", userText = "" } = req.body;
    const thread = getOrCreateThread(projectId);

    // Build the message list: system + prior + latest
    const messages = [
      { role: "system", content: SKETCHTILER_SYSTEM },
      // You can trim or summarize older messages if this grows large
      ...thread.messages.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: userText }
    ];

    // Store user message
    appendMessage(projectId, "user", userText);

    // Call Responses API (text)
    const resp = await openai.responses.create({
      model: "gpt-4o",
      input: messages
    });

    const assistantText = resp.output_text ?? "(No response text)";
    appendMessage(projectId, "assistant", assistantText);

    res.json({ threadId: thread.threadId, text: assistantText });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

// 4) Send text + an image (vision)
app.post("/api/chat-with-image", upload.single("image"), async (req, res) => {
  try {
    const { projectId = "sketchtiler", userText = "" } = req.body;
    const thread = getOrCreateThread(projectId);

    // If nothing to send, bail early
    if (!userText && !req.file) {
      return res.status(400).json({ error: "Provide userText and/or an image file." });
    }

    // Convert uploaded image to a data URL (what the Responses API expects)
    const mime = req.file?.mimetype || "image/png";
    const b64 = req.file ? req.file.buffer.toString("base64") : null;

    const content = [{ type: "input_text", text: userText || "Please analyze this image." }];

    if (b64) {
      content.push({
        type: "input_image",
        image_url: `data:${mime};base64,${b64}`, // <-- use image_url, not image_data
      });
      // Alternative if you host images:
      // content.push({ type: "input_image", image_url: "https://your.cdn.com/path.png" });
    }

    const messages = [
      { role: "system", content: SKETCHTILER_SYSTEM },
      ...thread.messages.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content } // multimodal message: text + (optional) image
    ];

    // Log the user turn to your thread memory
    appendMessage(projectId, "user", { multimodal: true, content });

    // Call the Responses API
    const resp = await openai.responses.create({
      model: "gpt-4o",
      input: messages
    });

    const assistantText = resp.output_text ?? "(No response text)";

    appendMessage(projectId, "assistant", assistantText);

    res.json({ threadId: thread.threadId, text: assistantText });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});


// 5) Optional: reset this project's conversation
app.post("/api/reset", (req, res) => {
  // In real life, delete from DB. Here you can restart your server to clear memory,
  // or implement a real reset that replaces the Map entry.
  res.json({ ok: true, note: "Restart server to clear in-memory store in this demo." });
});

// 6) Serve web client for local dev (static)
app.use(express.static("../web"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
