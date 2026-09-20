// Vercel Function: POST /api/chat
// Set DEEPSEEK_API_KEY in the Vercel project's environment variables.
import { handleChat } from "../server/chat_handler.js";

export const config = { runtime: "edge" };

export default function handler(request) {
  return handleChat(request, { env: process.env });
}
