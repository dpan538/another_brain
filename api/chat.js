// Vercel Edge Function: POST /api/chat — the product's only server route.
// It holds the owner's DeepSeek key and relays one conversation at a time;
// everything it does is in app/server/chat_handler.js.
// Set DEEPSEEK_API_KEY in the Vercel project's environment variables.
import { handleChat } from "../app/server/chat_handler.js";

export const config = { runtime: "edge" };

export default function handler(request) {
  return handleChat(request, { env: process.env });
}
