import { useState, useEffect, useRef } from "react";

const SECTORS = { CAI: "Precision Oncology · AI TechBio", SPY: "S&P 500 ETF · Top 500 US Stocks", CBRS: "AI Chips · Wafer-Scale Compute", VTI: "Total Stock Market ETF" };

const TICKER_EVENTS = {
  CAI: [
    { dot: "#ef4444", text: "Earnings release", sub: "Next report est. Aug 11, 2026 — watch EPS vs. consensus" },
    { dot: "#f59e0b", text: "Molecular profiling volume data", sub: "Key revenue driver — watch for growth updates" },
    { dot: "#22c55e", text: "MolDX reimbursement decisions", sub: "Coverage rulings can move the stock significantly" },
  ],
  CBRS: [
    { dot: "#ef4444", text: "Post-IPO lock-up period", sub: "Insider selling risk — lock-up expires ~90–180 days post May 14 IPO" },
    { dot: "#f59e0b", text: "AI chip demand signals", sub: "Watch NVDA, AMD earnings for sector read-through" },
    { dot: "#22c55e", text: "Hyperscaler contract news", sub: "OpenAI & AWS deals in place — watch for new announcements" },
  ],
  SPY: [
    { dot: "#ef4444", text: "Fed rate decision & commentary", sub: "FOMC meetings move the broad market" },
    { dot: "#f59e0b", text: "CPI / PPI inflation data", sub: "Macro data drives S&P 500 sentiment" },
    { dot: "#22c55e", text: "Big-cap earnings week", sub: "FAANG+ results heavily influence SPY price action" },
  ],
  VTI: [
    { dot: "#ef4444", text: "Fed rate decision & commentary", sub: "Rates affect all market caps — especially small/mid" },
    { dot: "#f59e0b", text: "Jobs report (NFP)", sub: "Labor data shapes growth expectations across sectors" },
    { dot: "#22c55e", text: "Small-cap earnings flow", sub: "VTI's broader exposure means more earnings events to track" },
  ],
  DEFAULT: [
    { dot: "#ef4444", text: "Earnings report", sub: "Check IR page for confirmed date" },
    { dot: "#f59e0b", text: "Fed rate signals", sub: "Macro backdrop affects all equities" },
    { dot: "#22c55e", text: "Sector news & analyst upgrades", sub: "Monitor for catalysts" },
  ],
};

const MODE_LABELS = {
  daily: "Daily Swing Setup",
  intraday: "Intraday Event Analysis",
  levels: "Key Levels & Technicals",
  risk: "Risk Management Plan",
};

const PROMPTS = {
  daily: (ticker, today) => `You are Sherry, a professional swing trading analyst. Today is ${today}. Analyze ${ticker} for a swing trade (3-10 day hold). Use web search for the current price and recent news.

Provide exactly in this format:
SIGNAL: [BULLISH SETUP | BEARISH SETUP | NEUTRAL/HOLD | WATCH CLOSELY]
THESIS: 2-3 sentences on the signal rationale including trend and sector context.
ENTRY ZONE: Specific price range to enter.
TARGET: Price target with brief reasoning.
STOP LOSS: Specific stop level.
KEY RISKS:
- Risk 1
- Risk 2
TODAY'S TAKEAWAY: One sentence summary.

Be specific with price numbers. Under 200 words total.`,

  intraday: (ticker, today) => `You are Sherry, a professional swing trading analyst. Today is ${today}. Analyze ${ticker} for intraday event-driven swing setups. Use web search for recent news and catalysts.

Provide exactly in this format:
SIGNAL: [BULLISH SETUP | BEARISH SETUP | NEUTRAL/HOLD | WATCH CLOSELY]
CATALYST WATCH: Key events that could move ${ticker} intraday this week.
BULLISH SCENARIO: What to watch if the catalyst is positive.
BEARISH SCENARIO: What to watch if the catalyst disappoints.
VOLUME SIGNALS: Volume patterns that confirm a real move.
FADE vs FOLLOW: Should a swing trader fade or follow the first intraday reaction?

Under 180 words. Be practical.`,

  levels: (ticker, today) => `You are Sherry, a professional swing trading analyst. Today is ${today}. Use web search to find the current price of ${ticker}, then provide key technical levels.

Provide exactly in this format:
SIGNAL: [BULLISH SETUP | BEARISH SETUP | NEUTRAL/HOLD | WATCH CLOSELY]
RESISTANCE 2: $[number]
RESISTANCE 1: $[number]
LAST CLOSE: $[number]
SUPPORT 1: $[number]
SUPPORT 2: $[number]
SUGGESTED STOP LOSS: $[number]
20-DAY MA: $[number]
50-DAY MA: $[number]
RSI: [number]
TECHNICAL SUMMARY: 2 sentences explaining what these levels mean for a swing trader right now.`,

  risk: (ticker, today) => `You are Sherry, a professional swing trading analyst. Today is ${today}. Create a risk management plan for swing trading ${ticker}.

Provide exactly in this format:
SIGNAL: [BULLISH SETUP | BEARISH SETUP | NEUTRAL/HOLD | WATCH CLOSELY]
POSITION SIZING: Suggested % of portfolio and why.
MAX LOSS RULE: Specific rule (e.g. never risk more than 1-2% of portfolio per trade).
STOP PLACEMENT: Which stop strategy to use and why.
SCALE-IN PLAN: How to add to a winning position.
EXIT STRATEGY: Two profit-taking tiers.
OVERNIGHT RISK: Key considerations for holding ${ticker} overnight.
BEGINNER TIP: One sentence of simple advice for someone new to swing trading.

Under 200 words.`,
};

async function callClaude(userMsg) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function fmt(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function extractSignal(text) {
  const t = text.toUpperCase();
  if (t.includes("BULLISH")) return "bullish";
  if (t.includes("BEARISH")) return "bearish";
  if (t.includes("NEUTRAL") || t.includes("HOLD")) return "neutral";
  if (t.includes("WATCH")) return "watch";
  return null;
}

function extractLevels(text) {
  const find = (label) => {
    const m = text.match(new RegExp(label + "[^\\d]*([\\d]+\\.?[\\d]*)", "i"));
    return m ? `$${parseFloat(m[1]).toFixed(2)}` : "—";
  };
  return {
    r2: find("RESISTANCE 2"),
    r1: find("RESISTANCE 1"),
    lc: find("LAST CLOSE"),
    s1: find("SUPPORT 1"),
    s2: find("SUPPORT 2"),
    sl: find("STOP LOSS"),
  };
}

const SIGNAL_STYLES = {
  bullish: { bg: "#dcfce7", color: "#15803d", label: "▲ Bullish Setup" },
  bearish: { bg: "#fee2e2", color: "#dc2626", label: "▼ Bearish Setup" },
  neutral: { bg: "#fef9c3", color: "#a16207", label: "— Neutral / Hold" },
  watch:   { bg: "#dbeafe", color: "#1d4ed8", label: "◎ Watch Closely" },
};

export default function SherrySwingTrader() {
  const [tickers, setTickers] = useState(["CAI", "SPY", "CBRS", "VTI"]);
  const [currentTicker, setCurrentTicker] = useState("CAI");
  const [currentMode, setCurrentMode] = useState("daily");
  const [loading, setLoading] = useState(false);
  const [analysisHtml, setAnalysisHtml] = useState("");
  const [signal, setSignal] = useState(null);
  const [error, setError] = useState("");
  const [levels, setLevels] = useState(null);
  const [askValue, setAskValue] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askResult, setAskResult] = useState("");
  const [askError, setAskError] = useState("");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  async function runAnalysis(ticker, mode) {
    setLoading(true);
    setError("");
    setAnalysisHtml("");
    setSignal(null);
    setLevels(null);
    try {
      const text = await callClaude(PROMPTS[mode](ticker, today));
      setAnalysisHtml(fmt(text));
      setSignal(extractSignal(text));
      if (mode === "levels") setLevels(extractLevels(text));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  function handleTickerClick(t) {
    setCurrentTicker(t);
    setAnalysisHtml("");
    setSignal(null);
    setError("");
    setLevels(null);
    setAskResult("");
    setAskError("");
  }

  function handleModeClick(mode) {
    setCurrentMode(mode);
    runAnalysis(currentTicker, mode);
  }

  async function handleAsk(question) {
    if (!question.trim()) return;
    setAskValue("");
    setAskLoading(true);
    setAskResult("");
    setAskError("");
    try {
      const text = await callClaude(
        `You are Sherry, a swing trading analyst. The user is watching ${currentTicker}. Answer concisely and practically (under 150 words). Use web search if needed. Question: ${question}`
      );
      setAskResult(fmt(text));
    } catch (e) {
      setAskError(e.message);
    }
    setAskLoading(false);
  }

  function addTicker() {
    const t = prompt("Enter stock ticker (e.g. AAPL):");
    if (!t) return;
    const sym = t.toUpperCase().trim();
    if (!tickers.includes(sym)) setTickers([...tickers, sym]);
    handleTickerClick(sym);
  }

  const sigStyle = signal ? SIGNAL_STYLES[signal] : null;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, background: "#0f2044", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#60b4f0" }}>📈</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#0f2044" }}>Sherry Swing Trader</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>AI-Powered Daily Analysis</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#6b7280" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
          {clock}
        </div>
      </div>

      {/* Watchlist */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "1.25rem" }}>
        <span style={{ fontSize: 12, color: "#6b7280" }}>Watchlist:</span>
        {tickers.map((t) => (
          <button key={t} onClick={() => handleTickerClick(t)}
            style={{ padding: "5px 14px", borderRadius: 20, border: currentTicker === t ? "none" : "1px solid #d1d5db", fontSize: 13, fontWeight: 600, cursor: "pointer", background: currentTicker === t ? "#0f2044" : "transparent", color: currentTicker === t ? "#60b4f0" : "#374151", transition: "all 0.15s" }}>
            {t}
          </button>
        ))}
        <button onClick={addTicker}
          style={{ padding: "5px 14px", borderRadius: 20, border: "1px dashed #d1d5db", fontSize: 12, cursor: "pointer", background: "transparent", color: "#6b7280" }}>
          + Add
        </button>
      </div>

      {/* Metrics row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: "1.25rem" }}>
        {[
          { label: "Ticker", value: currentTicker, sub: SECTORS[currentTicker] || "Stock" },
          { label: "Mode", value: MODE_LABELS[currentMode].split(" ")[0], sub: MODE_LABELS[currentMode].split(" ").slice(1).join(" ") },
          { label: "Today's Signal", value: sigStyle ? sigStyle.label : "—", sigStyle },
          { label: "Swing Horizon", value: "3–10 days", sub: "Daily timeframe" },
        ].map(({ label, value, sub, sigStyle }) => (
          <div key={label} style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
            {sigStyle
              ? <div style={{ display: "inline-block", background: sigStyle.bg, color: sigStyle.color, borderRadius: 12, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>{value}</div>
              : <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{value}</div>}
            {sub && !sigStyle && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Mode buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {Object.entries(MODE_LABELS).map(([mode, label]) => (
          <button key={mode} onClick={() => handleModeClick(mode)} disabled={loading}
            style={{ padding: "7px 16px", borderRadius: 20, border: currentMode === mode ? "none" : "1px solid #e5e7eb", fontSize: 12, cursor: loading ? "not-allowed" : "pointer", background: currentMode === mode ? "#0f2044" : "transparent", color: currentMode === mode ? "#60b4f0" : "#6b7280", fontWeight: currentMode === mode ? 600 : 400, transition: "all 0.15s", opacity: loading ? 0.6 : 1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Main AI Panel */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: "#6b7280", marginBottom: 12 }}>
          ✦ {MODE_LABELS[currentMode]} — <strong style={{ color: "#0f2044" }}>{currentTicker}</strong>
          {loading && <Spinner />}
        </div>

        {!analysisHtml && !loading && !error && (
          <div style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.6 }}>
            Choose an analysis mode above — the AI will generate a fresh recommendation using live web search data.
          </div>
        )}
        {loading && (
          <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
            Analyzing {currentTicker} with live web search…
          </div>
        )}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626", fontFamily: "monospace" }}>
            Error: {error}
          </div>
        )}
        {analysisHtml && !loading && (
          <div style={{ fontSize: 14, lineHeight: 1.75, color: "#111827" }} dangerouslySetInnerHTML={{ __html: analysisHtml }} />
        )}
      </div>

      {/* Key Levels (shown when mode=levels and data available) */}
      {levels && (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#6b7280", marginBottom: 10 }}>📐 Key Price Levels</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
            {[
              { label: "Resistance 2", val: levels.r2, color: "#dc2626" },
              { label: "Support 1", val: levels.s1, color: "#15803d" },
              { label: "Resistance 1", val: levels.r1, color: "#f97316" },
              { label: "Support 2", val: levels.s2, color: "#16a34a" },
              { label: "Last Close", val: levels.lc, color: "#0f2044" },
              { label: "Stop Loss", val: levels.sl, color: "#dc2626" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                <span style={{ color: "#6b7280" }}>{label}</span>
                <span style={{ fontWeight: 600, color }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events + Ask in row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#6b7280", marginBottom: 10 }}>🗓 Watch This Week</div>
          {(TICKER_EVENTS[currentTicker] || TICKER_EVENTS.DEFAULT).map(({ dot, text, sub }) => (
            <div key={text} style={{ display: "flex", gap: 8, padding: "7px 0", borderBottom: "1px solid #f9fafb" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: dot, marginTop: 5, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, color: "#111827" }}>{text}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1rem 1.25rem" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#6b7280", marginBottom: 10 }}>💬 Quick Questions</div>
          {[
            `Key risks for ${currentTicker} this week?`,
            `Entry, target, and stop for ${currentTicker}?`,
            `Explain ${currentTicker} business simply`,
            `Is now a good time to swing trade ${currentTicker}?`,
          ].map((q) => (
            <button key={q} onClick={() => handleAsk(q)} disabled={askLoading}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 0", border: "none", background: "transparent", fontSize: 12, color: "#3b82f6", cursor: askLoading ? "not-allowed" : "pointer", borderBottom: "1px solid #f3f4f6", opacity: askLoading ? 0.5 : 1 }}>
              ↗ {q}
            </button>
          ))}
        </div>
      </div>

      {/* Ask input */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "#6b7280", marginBottom: 10 }}>Ask the Analyst</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={askValue} onChange={(e) => setAskValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAsk(askValue)}
            placeholder={`e.g. What's the risk/reward on ${currentTicker} right now?`}
            style={{ flex: 1, padding: "9px 13px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, color: "#111827", background: "#f9fafb", outline: "none" }} />
          <button onClick={() => handleAsk(askValue)} disabled={askLoading || !askValue.trim()}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#0f2044", color: "#60b4f0", fontSize: 13, fontWeight: 600, cursor: askLoading || !askValue.trim() ? "not-allowed" : "pointer", opacity: askLoading || !askValue.trim() ? 0.5 : 1 }}>
            {askLoading ? "…" : "Ask ↗"}
          </button>
        </div>

        {askLoading && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#9ca3af", display: "flex", alignItems: "center", gap: 8 }}>
            <Spinner /> Sherry is thinking…
          </div>
        )}
        {askError && (
          <div style={{ marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#dc2626", fontFamily: "monospace" }}>
            Error: {askError}
          </div>
        )}
        {askResult && !askLoading && (
          <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.75, color: "#111827" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 5 }}>✦ Sherry's answer:</div>
            <div dangerouslySetInnerHTML={{ __html: askResult }} />
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6, borderTop: "1px solid #f3f4f6", paddingTop: "1rem" }}>
        <strong>Educational use only.</strong> Sherry Swing Trader is an AI tool for learning and exploration — not financial advice. Always do your own research and consult a licensed advisor before trading. Past patterns do not guarantee future results.
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ width: 14, height: 14, border: "2px solid #bfdbfe", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
  );
}
