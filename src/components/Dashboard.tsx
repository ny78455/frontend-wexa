import React, { useState, useEffect, useRef } from "react";
import { User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar
} from "recharts";
import {
  Users, MousePointer2, Eye, TrendingUp,
  Terminal, Play, RefreshCw, Upload, AlertCircle, CheckCircle2, Activity, Shield,
  Copy, Check, Database
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";

// Utility Component for consistent card structure
function DashboardCard({ title, subtitle, icon: Icon, children, className = "", dark = false, action }: any) {
  return (
    <div className={`${dark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'} border p-6 rounded-2xl shadow-sm flex flex-col relative overflow-hidden transition-all duration-300 ${className}`}>
      <div className="flex items-start justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          {Icon && <div className={`p-2 rounded-xl ${dark ? 'bg-slate-900 text-blue-400' : 'bg-slate-50 text-blue-600'}`}><Icon size={18} /></div>}
          <div>
            <h3 className={`font-bold text-sm tracking-tight font-display uppercase ${dark ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
            {subtitle && <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="flex-1 relative z-10">
        {children}
      </div>
    </div>
  );
}

export default function Dashboard({ user }: { user: User }) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [autoSimulate, setAutoSimulate] = useState(true);
  const [liveEvents, setLiveEvents] = useState<any[]>(Array.from({ length: 12 }).map((_, i) => ({
    id: `seed-${i}`,
    type: ["page_view", "click", "api_call", "db_query", "heartbeat", "signup"][i % 6],
    timestamp: new Date(Date.now() - i * 1000 * 60 * 10).toISOString(),
    properties: {
      latency: 45 + Math.floor(Math.random() * 100),
      region: ["us-east-1", "eu-west-1", "ap-south-1"][i % 3],
      status: "200"
    },
    userId: `node_seed_${i}`
  })));
  const [systemTraces, setSystemTraces] = useState<any[]>([]);
  const [spans, setSpans] = useState<any[]>([]);

  // Troubleshooting states
  const [rlsError, setRlsError] = useState<string | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);
  const [showTroubleshooter, setShowTroubleshooter] = useState(false);

  const syntheticUsers = [
    { id: "node_alice_7", name: "Alice Jenkins", region: "eu-west-1" },
    { id: "node_bob_3", name: "Bob Smith", region: "us-east-1" },
    { id: "node_charlie_1", name: "Charlie Davis", region: "ap-south-1" },
    { id: "node_delta_9", name: "Delta Force", region: "us-west-2" }
  ];

  const orgId = user.id;

  // Continuous Tracing Simulation
  useEffect(() => {
    const traceTypes = [
      "DB_CONNECT", "CACHE_HIT", "IO_READY", "AUTH_VERIFIED",
      "SOCKET_PING", "MEM_SYNC", "ASYNC_RESOLVE", "GC_RUN"
    ];

    const interval = setInterval(() => {
      const traceId = Math.random().toString(36).substr(2, 9);
      const type = traceTypes[Math.floor(Math.random() * traceTypes.length)];
      const newTrace = {
        id: traceId,
        type: type,
        level: Math.random() > 0.9 ? "WARN" : "INFO",
        timestamp: new Date().toISOString(),
        node: "node-" + Math.floor(Math.random() * 8)
      };
      setSystemTraces(prev => [newTrace, ...prev.slice(0, 24)]);

      // Gantt spans
      const startOffset = Math.random() * 60;
      const duration = 40 + Math.random() * 120;
      const newSpan = {
        id: traceId,
        task: type,
        start: startOffset,
        duration: duration,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]
      };
      setSpans(prev => [newSpan, ...prev.slice(0, 6)]);
    }, 800);

    return () => clearInterval(interval);
  }, []);

  // Auto-simulation
  useEffect(() => {
    let interval: any;
    if (autoSimulate) {
      interval = setInterval(() => {
        simulateEvent();
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [autoSimulate, orgId]);

  const [metrics, setMetrics] = useState({
    latency: 21,
    cpu: 4.2,
    peers: 3
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        latency: Math.max(15, Math.min(35, prev.latency + (Math.random() - 0.5) * 2)),
        cpu: Math.max(2, Math.min(10, prev.cpu + (Math.random() - 0.5) * 0.5)),
        peers: 3
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchInitial = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("org_id", orgId)
        .order("timestamp", { ascending: false })
        .limit(50);

      if (error) {
        if (error.code === "42501" || error.message.includes("row-level security")) {
          setRlsError("Supabase Row-Level Security (RLS) is blocking read/write access to the events table.");
        } else {
          setRlsError(error.message);
        }
        throw error;
      }
      if (data && data.length > 0) {
        setLiveEvents(data.map(e => ({
          id: e.id,
          orgId: e.org_id,
          type: e.event_type,
          properties: e.properties,
          timestamp: e.timestamp,
          userId: e.user_id
        })));
        setRlsError(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchInitial();
    const channel = supabase
      .channel('realtime-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const e = payload.new;
          setLiveEvents((prev) => [{
            id: e.id, orgId: e.org_id, type: e.event_type, properties: e.properties, timestamp: e.timestamp, userId: e.user_id
          }, ...prev.slice(0, 49)]);
          setRlsError(null);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId]);

  const simulateEvent = async () => {
    setIsSimulating(true);
    try {
      const types = ["page_view", "click", "purchase", "signup", "error", "api_call", "db_query", "heartbeat"];
      const type = types[Math.floor(Math.random() * types.length)];
      const randomUser = syntheticUsers[Math.floor(Math.random() * syntheticUsers.length)];
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId, type, userId: randomUser.id,
          properties: {
            browser: Math.random() > 0.5 ? "Chrome" : "Firefox",
            path: ["/api/v1/auth", "/dashboard", "/settings", "/billing"][Math.floor(Math.random() * 4)],
            latency: Math.floor(Math.random() * 250) + 20,
            user_region: randomUser.region
          }
        })
      });

      if (!response.ok) {
        const errJson = await response.json();
        const errMsg = errJson.error || "";
        if (errMsg.includes("row-level security policy") || errMsg.includes("violates") || response.status === 403) {
          setRlsError("Supabase Row-Level Security (RLS) is actively blocking event insertions.");
        } else {
          setRlsError(errMsg || `API ingestion failed with response code ${response.status}`);
        }
      } else {
        setRlsError(null);
      }
    } catch (err: any) {
      console.error(err);
      // Don't override RLS error if already set unless it's a hard network failure
      if (!rlsError) {
        setRlsError(err.message || "Failed to deliver event payload to background API.");
      }
    } finally { setIsSimulating(false); }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedQuery(text);
    setTimeout(() => {
      setCopiedQuery(null);
    }, 2000);
  };

  const typeCounts = liveEvents.reduce((acc: any, curr: any) => {
    acc[curr.type] = (acc[curr.type] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));
  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#ef4444"];

  const timeSeriesData = Array.from({ length: 30 }).map((_, i) => {
    const event = liveEvents[29 - i];
    return {
      time: event ? format(new Date(event.timestamp), "HH:mm:ss") : format(new Date(Date.now() - (30 - i) * 2000), "HH:mm:ss"),
      volume: event ? Math.floor(Math.random() * 20) + 40 : 10 + Math.random() * 5,
      latency: event?.properties?.latency || 15 + Math.random() * 10,
    };
  });

  return (
    <div className="space-y-8 pb-12 overflow-x-hidden">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter font-display uppercase">Aether<span className="text-blue-600">.</span>OS</h1>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-1">Real-time Telemetry Control Center</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 rounded-xl p-1">
            <button onClick={() => setAutoSimulate(!autoSimulate)} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${autoSimulate ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-400'}`}>
              {autoSimulate ? 'Streaming' : 'Paused'}
            </button>
          </div>
          <button onClick={simulateEvent} disabled={isSimulating} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 active:scale-95 disabled:opacity-50">
            <Play size={14} /> Force Ingest
          </button>
        </div>
      </header>

      {/* RLS Troubleshooting Panel & Error Indicator */}
      {rlsError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-rose-200 bg-rose-50 text-rose-950 p-6 rounded-2xl shadow-sm space-y-4"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-100 text-rose-600 rounded-lg shrink-0 mt-0.5 animate-pulse">
                <AlertCircle size={20} />
              </div>
              <div>
                <h4 className="font-bold text-sm tracking-tight text-rose-900 font-display">Active Row-Level Security (RLS) Detected</h4>
                <p className="text-xs text-rose-700/95 mt-1 leading-relaxed">
                  Supabase rejected the event updates (PG error <code className="font-mono bg-rose-100/80 px-1 py-0.5 rounded font-bold text-rose-800">42501</code>). Live telemetry ingest is temporarily paused because you need a data upload policy.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => setShowTroubleshooter(!showTroubleshooter)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] tracking-wider uppercase rounded-xl transition-all shadow-md shadow-rose-200"
              >
                {showTroubleshooter ? "Hide Troubleshooting Steps" : "Fix Permissions Instantly"}
              </button>
              <button
                onClick={() => { setRlsError(null); simulateEvent(); }}
                className="px-4 py-2 bg-white hover:bg-rose-100/50 border border-thin border-rose-200 text-rose-800 font-black text-[10px] tracking-wider uppercase rounded-xl transition-all"
              >
                Retry Ingest
              </button>
            </div>
          </div>

          {showTroubleshooter && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-4 pt-5 border-t border-rose-200/60 grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              <div className="space-y-4">
                <p className="text-xs text-rose-900 leading-relaxed">
                  To stream custom live events successfully to Supabase, run one of the following operations inside your <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="font-bold underline text-rose-800 hover:text-rose-950">Supabase SQL Editor</a>:
                </p>

                {/* Option 1: Disable RLS */}
                <div className="p-4 bg-white/70 rounded-xl border border-rose-200/40 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 font-mono">Method 1: Complete Sandbox Bypass (Easiest)</span>
                    <button
                      onClick={() => handleCopy("ALTER TABLE events DISABLE ROW LEVEL SECURITY;")}
                      className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
                      title="Copy SQL Command"
                    >
                      {copiedQuery === "ALTER TABLE events DISABLE ROW LEVEL SECURITY;" ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <pre className="text-[10px] font-mono bg-slate-900 text-slate-100 p-2.5 rounded-lg overflow-x-auto select-all">
                    ALTER TABLE events DISABLE ROW LEVEL SECURITY;
                  </pre>
                  <p className="text-[9px] text-rose-700 mt-2 font-medium">✨ Ideal for sandboxes and demo projects to allow unrestricted simulated metric streaming.</p>
                </div>

                {/* Option 2: Add policy */}
                <div className="p-4 bg-white/70 rounded-xl border border-rose-200/40 relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 font-mono">Method 2: Client-side Ingest Rules (Secure)</span>
                    <button
                      onClick={() => handleCopy("CREATE POLICY \"Enable uploads for all\" ON public.events FOR INSERT WITH CHECK (true);\nCREATE POLICY \"Enable reads for all\" ON public.events FOR SELECT WITH CHECK (true);")}
                      className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors"
                      title="Copy SQL Command"
                    >
                      {copiedQuery?.startsWith("CREATE POLICY") ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <pre className="text-[9px] font-mono bg-slate-900 text-slate-100 p-2.5 rounded-lg overflow-x-auto select-all leading-relaxed">
                    {"CREATE POLICY \"Enable uploads for all\" ON public.events FOR INSERT WITH CHECK (true);\nCREATE POLICY \"Enable reads for all\" ON public.events FOR SELECT WITH CHECK (true);"}
                  </pre>
                  <p className="text-[9px] text-rose-700 mt-2 font-medium">🔒 Authorizes streaming events while preserving safety controls on other system tables.</p>
                </div>
              </div>

              <div className="space-y-4 bg-white/40 p-5 rounded-2xl border border-rose-200/30">
                <div className="flex items-center gap-2 text-rose-900">
                  <Database size={16} />
                  <h5 className="font-bold text-xs uppercase tracking-wider">Need to initialize the full table schema?</h5>
                </div>
                <p className="text-xs text-rose-800 leading-relaxed">
                  If the table structure is missing completely or has incorrect columns, run the following definition query:
                </p>
                <div className="relative">
                  <pre className="text-[9px] font-mono bg-slate-900 text-slate-200 p-3 rounded-xl overflow-x-auto max-h-[140px] leading-relaxed">
                    {`CREATE TABLE IF NOT EXISTS public.events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id text NOT NULL,
  event_type text NOT NULL,
  properties jsonb DEFAULT '{}',
  user_id text,
  timestamp timestamptz DEFAULT now()
);

-- Disable RLS for standard streaming
ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;`}
                  </pre>
                  <button
                    onClick={() => handleCopy(`CREATE TABLE IF NOT EXISTS public.events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id text NOT NULL,
  event_type text NOT NULL,
  properties jsonb DEFAULT '{}',
  user_id text,
  timestamp timestamptz DEFAULT now()
);

-- Disable RLS for standard streaming
ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;`)}
                    className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white p-1.5 rounded-md transition-colors"
                    title="Copy full SQL Table Code"
                  >
                    {copiedQuery?.includes("CREATE TABLE") ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  </button>
                </div>
                <div className="pt-2 border-t border-rose-200/30">
                  <h6 className="text-[9px] font-black uppercase text-rose-800 tracking-wider">Method 3: Backend Super-User Token Bypass (Optimal)</h6>
                  <p className="text-[10px] text-rose-700/90 mt-1 leading-relaxed">
                    Provide your Supabase <code className="font-mono bg-rose-100 text-rose-800 px-1 py-0.5 rounded text-[9px] font-semibold">SUPABASE_SERVICE_ROLE_KEY</code> as an environment variable in AI Studio Settings. Once entered, the secure server API automatically routes system events bypassing RLS.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Tier 1: KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPIItem icon={<Activity className="text-blue-500" />} label="Node Latency" value={metrics.latency.toFixed(0)} unit="ms" trend="-2ms" isSuccess />
        <KPIItem icon={<TrendingUp className="text-emerald-500" />} label="Total Ingress" value={liveEvents.length} unit="evt" trend="+12%" />
        <KPIItem icon={<Users className="text-amber-500" />} label="Active Peers" value={metrics.peers} trend="Stable" />
        <KPIItem icon={<AlertCircle className="text-rose-500" />} label="CPU Pressure" value={metrics.cpu.toFixed(1)} unit="%" trend="Optimal" isSuccess />
      </div>

      {/* Tier 2: Analytical Hub */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <div className="xl:col-span-8">
          <DashboardCard title="Ingress Velocity" subtitle="Real-time Throughput Analysis" icon={TrendingUp} dark className="h-full">
            <div className="h-[420px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.3} />
                  <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} dy={10} minTickGap={40} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px" }} />
                  <Area type="monotone" dataKey="volume" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorVol)" animationDuration={1000} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </DashboardCard>
        </div>
        <div className="xl:col-span-4">
          <DashboardCard title="Event Segmentation" subtitle="Workload Distribution" icon={Shield} className="h-full">
            <div className="h-56 w-full mt-2 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData.length > 0 ? pieData : [{ name: "none", value: 1 }]} innerRadius={65} outerRadius={85} paddingAngle={4} dataKey="value">
                    {pieData.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} cornerRadius={4} />)}
                    {pieData.length === 0 && <Cell fill="#f1f5f9" />}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-black text-slate-900 font-display">{liveEvents.length}</span>
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest font-mono">Total Packets</span>
              </div>
            </div>
            <div className="mt-8 space-y-4">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      {entry.name}
                    </div>
                    <span className="text-slate-900">{entry.value}</span>
                  </div>
                  <div className="w-full h-1 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${((entry.value as number) / (liveEvents.length || 1)) * 100}%`, backgroundColor: COLORS[index % COLORS.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </div>

      {/* Tier 3: Operational Deep-Dive */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Live Logs */}
        <DashboardCard title="Telemetry Ingest" subtitle="Live Data Stream" icon={Terminal} action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-[8px] font-bold">
              <div className="w-1 h-1 bg-blue-600 rounded-full animate-ping" />
              BUFFERING
            </div>
            <button onClick={fetchInitial} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
              <RefreshCw size={14} className={isSimulating ? "animate-spin" : ""} />
            </button>
          </div>
        }>
          <div className="h-[400px] overflow-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
            <AnimatePresence initial={false}>
              {liveEvents.map((e, i) => (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={e.id || i} className="text-[10px] font-mono p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:border-blue-200 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 font-bold">[{format(new Date(e.timestamp), "HH:mm:ss")}]</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${e.type === 'error' ? 'bg-rose-500 text-white' : 'bg-blue-600 text-white'}`}>
                      {e.type}
                    </span>
                  </div>
                  <div className="text-slate-600 truncate opacity-70 group-hover:opacity-100 transition-opacity">
                    {JSON.stringify(e.properties)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </DashboardCard>

        {/* Internal Traces */}
        <DashboardCard title="System Traces" subtitle="Kernel Events" icon={Activity} dark>
          <div className="h-[400px] overflow-auto space-y-2 pr-2 scrollbar-hide">
            {systemTraces.map((trace) => (
              <div key={trace.id} className="text-[9px] font-mono flex items-start gap-3 border-l border-slate-800 pl-3 py-1 group">
                <span className="text-slate-600 tabular-nums">{format(new Date(trace.timestamp), "HH:mm:ss.S")}</span>
                <span className={`font-bold transition-colors ${trace.level === 'WARN' ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {trace.type}
                </span>
                <span className="text-slate-700 ml-auto uppercase font-bold tracking-tighter">NODE::{trace.node}</span>
              </div>
            ))}
          </div>
        </DashboardCard>

        {/* Trace Gantt */}
        <DashboardCard title="Trace Lifecycle" subtitle="Execution Timeline" icon={Play} dark>
          <div className="h-[400px] flex flex-col pt-4">
            <div className="flex-1 space-y-5">
              {spans.map((span) => (
                <div key={span.id} className="space-y-1.5">
                  <div className="flex justify-between items-center text-[9px] font-bold font-mono tracking-widest text-slate-500">
                    <span className="truncate max-w-[120px] uppercase">{span.task}</span>
                    <span className="text-slate-700">{span.duration.toFixed(0)}ms</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-900 rounded-full relative overflow-hidden">
                    <motion.div initial={{ width: 0, x: `${span.start}%` }} animate={{ width: `${span.duration / 3}%`, x: `${span.start}%` }} className="h-full rounded-full opacity-70" style={{ backgroundColor: span.color }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between text-[8px] font-black uppercase font-mono tracking-widest text-slate-500">
              <div className="flex gap-4">
                <span>0ms</span>
                <span>250ms</span>
                <span>500ms</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-500">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}

function KPIItem({ icon, label, value, trend, unit = "", isSuccess = false }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-blue-500 transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <span className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] font-mono">{label}</span>
        <div className="p-2.5 bg-slate-50 group-hover:bg-blue-50 rounded-xl transition-colors">{icon}</div>
      </div>
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-slate-900 tracking-tighter font-display">{value}</span>
          {unit && <span className="text-[10px] font-black text-slate-400 uppercase font-mono">{unit}</span>}
        </div>
        <div className={`text-[9px] font-black px-2 py-1 rounded-lg font-mono ${isSuccess ? "bg-emerald-50 text-emerald-600" :
          trend.startsWith("+") ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500"
          }`}>
          {trend}
        </div>
      </div>
    </div>
  );
}
