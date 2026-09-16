/**
 * Netlify Function — API handler
 *
 * Wraps the Hono app from server/index.ts as a Netlify serverless function.
 * All requests to /api/* are routed here by netlify.toml redirects.
 */
import type { Context } from "@netlify/functions";
import { app } from "../../server/index";

export default async (request: Request, context: Context) => {
  return app.fetch(request);
};

export const config = {
  path: "/api/*",
};
