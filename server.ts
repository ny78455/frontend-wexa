import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { z } from "zod";
import WebSocket from "ws"; // <--- ADD THIS LINE

dotenv.config();

import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Check if import.meta exists (ESM) or fallback to native variables (CommonJS)
const _filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const _dirname = typeof __dirname !== 'undefined' ? __dirname : dirname(_filename);

// Supabase Setup
// Table requirements:
// CREATE TABLE events (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   org_id text NOT NULL,
//   event_type text NOT NULL,
//   properties jsonb DEFAULT '{}',
//   user_id text,
//   timestamp timestamptz DEFAULT now()
// );
//
// -- ENABLE REALTIME:
// ALTER PUBLICATION supabase_realtime ADD TABLE events;
//
// -- DISABLE RLS FOR DEMO (OR ADD POLICIES):
// ALTER TABLE events DISABLE ROW LEVEL SECURITY;
const supabaseUrl = "https://jqplcafqksyysdbkwtru.supabase.co";
const supabaseKey = "sb_publishable_jKRfCrH-PSmo99auN5ciYw_0LdI0UOJ";

if (!supabaseUrl || !supabaseKey) {
  console.error("CRITICAL: Missing Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).");
}

// Replace your old createClient with this one:
const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder",
  {
    auth: {
      persistSession: false, // Prevents warning logs in Node.js
    },
    realtime: {
      transport: WebSocket, // Fixes the Node 20 WebSocket error!
    }
  }
);

async function startServer() {
  const app = express();
  const PORT = 3001;

  console.log("Starting Aether server with Supabase...");

  app.use(express.json());

  // Event validation schema
  const eventSchema = z.object({
    orgId: z.string(),
    type: z.string(),
    properties: z.record(z.string(), z.any()).optional(),
    userId: z.string().optional(),
    timestamp: z.string().optional(),
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Ingest Events
  app.post("/api/events", async (req, res) => {
    try {
      const data = eventSchema.parse(req.body);
      const event = {
        org_id: data.orgId,
        event_type: data.type,
        properties: data.properties || {},
        user_id: data.userId || null,
        timestamp: data.timestamp || new Date().toISOString(),
      };

      const { error } = await supabase.from("events").insert([event]);

      if (error) throw error;

      res.status(202).json({ status: "accepted" });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues });
      }
      console.error("Ingestion error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Get Stats
  app.get("/api/stats/:orgId", async (req, res) => {
    const { orgId } = req.params;
    try {
      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .eq("org_id", orgId)
        .order("timestamp", { ascending: false })
        .limit(100);

      if (error) throw error;
      res.json(events.map(e => ({
        id: e.id,
        orgId: e.org_id,
        type: e.event_type,
        properties: e.properties,
        timestamp: e.timestamp,
        userId: e.user_id
      })));
    } catch (error: any) {
      console.error("Stats query error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
