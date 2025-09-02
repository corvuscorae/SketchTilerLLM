// server/langchain.js
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { tool } from "@langchain/core/tools";

export const SKETCHTILER_SYSTEM = `
SketchTiler is a tilemap generation tool that transforms hand-drawn sketches into structured, game-ready maps. It enables quick ideation and prototyping using a simple structure pen interface and wave function collapse.

Ideal for:

Game level design
Conceptual prototyping
Creative sketch-to-map workflows

You are SketchTiler Assistant. Goal: assist with ideation and editing for tile-based level sketches.
Be proactive: propose changes, ask clarifying questions, and produce structured action plans.
When given images of maps/tiles, describe salient features and suggest improvements.
When asked, output actionable JSON of proposed edits.
`;

// ---- Example tool (stub) you can later implement to call SketchTiler APIs ----
const proposeEdits = tool(
  async ({ goal, constraints }) => {
    // TODO: replace this stub with a real call into SketchTiler's backend
    return JSON.stringify({
      plan: [
        "Analyze current map constraints",
        "Propose 3 edits consistent with constraints",
        "Output JSON { fixes: [...] }"
      ],
      received: { goal, constraints }
    });
  },
  {
    name: "proposeEdits",
    description:
      "Propose concrete tile edits for a given goal and constraints. Return machine-readable JSON.",
    schema: z.object({
      goal: z.string().describe("High-level edit goal"),
      constraints: z.string().describe("Design rules or constraints")
    }),
  }
);

// ---- Model (LangChain) ----
export const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.4,
  apiKey: process.env.OPENAI_API_KEY,
});

// Bind tools to enable function-calling when helpful
const llmWithTools = llm.bindTools([proposeEdits]);

// ---- Prompt with a history slot ----
const prompt = ChatPromptTemplate.fromMessages([
  ["system", SKETCHTILER_SYSTEM],
  new MessagesPlaceholder("history"),
  ["human", "{input}"],
]);

// Parse final text out (you can switch to JSON parser for strict schemas)
const parser = new StringOutputParser();

// Compose chain
const baseChain = prompt.pipe(llmWithTools).pipe(parser);

// ---- Per-project (session) history store ----
const histories = new Map(); // key: projectId -> InMemoryChatMessageHistory

function getHistory(projectId) {
  if (!histories.has(projectId)) {
    histories.set(projectId, new InMemoryChatMessageHistory());
  }
  return histories.get(projectId);
}

// Wrap with message history so LangChain keeps conversation state per projectId
export const conversational = new RunnableWithMessageHistory({
  runnable: baseChain,
  getMessageHistory: async (config) => {
    const projectId = config?.configurable?.sessionId || "sketchtiler";
    return getHistory(projectId);
  },
  // maps: input key used by prompt, and which slot is the history
  inputMessagesKey: "input",
  historyMessagesKey: "history",
});

// Helper to append a raw user/AI turn to history if you do any manual calls:
export async function pushManualTurn(projectId, role, content) {
  const h = getHistory(projectId);
  if (role === "user") {
    await h.addUserMessage(content);
  } else {
    await h.addAIMessage(content);
  }
}
