import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { usePipeline } from "./PipelineContext";
import { ThemeContext } from "./ThemeContext";
import { callClaudeChat } from "./claudeApi";

/* ═══════════════════════════════════════════════════════
   Strategy Advisor — AI Chat Panel
   Side-slide drawer powered by Claude, reads live pipeline data
   ═══════════════════════════════════════════════════════ */

const SUGGESTED = [
  "What are our biggest visibility gaps?",
  "How do we compare to Icertis?",
  "Which authority domains should we prioritize?",
  "Summarize our AI perception scorecard",
];

/** Build a system prompt from live pipeline data */
function buildSystemPrompt(ps) {
  const meta = ps?.meta || {};
  const m1 = ps?.m1 || {};
  const m2 = ps?.m2 || {};
  const m3 = ps?.m3 || {};
  const m4 = ps?.m4 || {};
  const m5 = ps?.m5 || {};

  const scores = m2.scores || {};
  const competitors = (m2.competitorSummary || [])
    .slice(0, 6)
    .map((c) => `${c.name} (${c.mentions} mentions, ${c.positive} positive)`)
    .join("; ");

  const topGaps = (m3.prioritizedDomains || [])
    .filter((d) => d.sirionStatus === "verified_zero")
    .sort((a, b) => (b.da || 0) - (a.da || 0))
    .slice(0, 5)
    .map((d) => `${d.domain} (DA ${d.da}, ${d.priority} priority)`)
    .join("; ");

  const personas = (m1.personaProfiles || [])
    .map((p) => `${p.name} - ${p.title} at ${p.company}`)
    .slice(0, 6)
    .join("; ");

  return `You are the Xtrusio Strategy Advisor for ${meta.company || "the company"} (${meta.industry || "B2B SaaS"}).
You help marketing and growth leaders interpret AI visibility data and recommend actions to improve organic discovery in AI search engines (ChatGPT, Claude, Gemini).

Current Pipeline Data:
- Company: ${meta.company || "N/A"} | Industry: ${meta.industry || "N/A"} | URL: ${meta.url || "N/A"}
- M1 Discovery Questions: ${m1.questions?.length || 0} questions across ${(m1.personas || []).length} persona types
- Key personas: ${personas || "None researched yet"}
- M2 AI Visibility Score: ${scores.overall ?? "N/A"}/100 | Mention Rate: ${scores.mention ?? "N/A"}% | Share of Voice: ${scores.shareOfVoice ?? "N/A"}%
- M2 Sentiment: ${scores.sentiment ?? "N/A"}% | Accuracy: ${scores.accuracy ?? "N/A"}% | Completeness: ${scores.completeness ?? "N/A"}%
- Top competitors: ${competitors || "No scan data yet"}
- M3 Authority Ring: ${m3.gapCount ?? 0} gap domains (zero presence), ${m3.strongCount ?? 0} strong, ${m3.presentCount ?? 0} present, ${m3.totalDomains ?? 0} total analyzed
- M3 Top gap domains: ${topGaps || "No authority data yet"}
- M4 Buying Stage: Latest stage analyzed: ${m4.latestStage || "N/A"} | ${m4.analyses?.length || 0} analyses completed
- M5 Recommendations: ${m5.recommendations?.length || 0} active recommendations

Guidelines:
- Keep responses concise (2-4 paragraphs max unless asked for detail)
- Use bullet points for actionable recommendations
- Reference specific data points and numbers from the pipeline
- If data is missing (N/A or 0), note that the module hasn't been run yet and suggest doing so
- Focus on strategic implications, not technical details
- Be direct and opinionated — the user wants clear advice, not hedging`;
}

/** Minimal markdown: **bold**, *italic*, bullet lists, line breaks */
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Bullet list item
    if (/^[\-\*]\s/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^[\-\*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[\-\*]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={elements.length} style={{ margin: "6px 0", paddingLeft: 20 }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: 3 }}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\d+[\.\)]\s/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^\d+[\.\)]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[\.\)]\s/, ""));
        i++;
      }
      elements.push(
        <ol key={elements.length} style={{ margin: "6px 0", paddingLeft: 20 }}>
          {items.map((item, j) => (
            <li key={j} style={{ marginBottom: 3 }}>{formatInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line = paragraph break
    if (!line.trim()) {
      elements.push(<div key={elements.length} style={{ height: 8 }} />);
      i++;
      continue;
    }

    // Regular text line
    elements.push(<p key={elements.length} style={{ margin: "2px 0" }}>{formatInline(line)}</p>);
    i++;
  }

  return elements;
}

/** Inline formatting: **bold** and *italic* */
function formatInline(text) {
  // Split by **bold** and *italic* markers
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, boldMatch.index)}</span>);
      }
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      continue;
    }
    // Italic
    const italicMatch = remaining.match(/\*(.+?)\*/);
    if (italicMatch && italicMatch.index !== undefined) {
      if (italicMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.slice(0, italicMatch.index)}</span>);
      }
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch.index + italicMatch[0].length);
      continue;
    }
    // No more matches
    parts.push(<span key={key++}>{remaining}</span>);
    break;
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/* ── Loading dots animation ── */
function LoadingDots({ t }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 6, height: 6, borderRadius: "50%",
            background: t.brand,
            animation: `pulse 1.2s infinite ${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Main Component ── */
export default function StrategyAdvisor({ open, onClose }) {
  const t = useContext(ThemeContext);
  const { pipeline } = usePipeline();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return;
    setError(null);

    const userMsg = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const systemPrompt = buildSystemPrompt(pipeline);
      const response = await callClaudeChat(systemPrompt, updatedMessages);
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [messages, loading, pipeline]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    setInput("");
  };

  if (!open) return null;

  const isMobile = window.innerWidth < 900;
  const drawerW = isMobile ? "100vw" : 400;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 199,
          background: "rgba(0,0,0,0.35)",
          animation: "fadeIn 0.2s ease-out",
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: drawerW, zIndex: 200,
          background: t.bgCard || t.bg,
          borderLeft: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column",
          animation: "slideInRight 0.3s ease-out",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.25)",
        }}
      >
        {/* Inline keyframes */}
        <style>{`
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        `}</style>

        {/* Header */}
        <div style={{
          padding: "16px 18px", borderBottom: `1px solid ${t.border}`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: `linear-gradient(135deg, ${t.brand}, ${t.brandDim || t.brand})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, color: "#fff",
          }}>AI</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Strategy Advisor</div>
            <div style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)" }}>
              Powered by Claude
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              style={{
                background: "none", border: `1px solid ${t.border}`, borderRadius: 5,
                padding: "4px 10px", fontSize: 11, color: t.textDim,
                cursor: "pointer", fontFamily: "var(--mono)",
              }}
            >Clear</button>
          )}
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", fontSize: 18,
              color: t.textDim, cursor: "pointer", padding: "2px 6px",
              borderRadius: 4, lineHeight: 1,
            }}
          >&times;</button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 18px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {/* Welcome state */}
          {messages.length === 0 && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 20 }}>
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, margin: "0 auto 12px",
                  background: `linear-gradient(135deg, ${t.brand}, ${t.brandDim || t.brand})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: "#fff",
                }}>AI</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: t.text, marginBottom: 4 }}>
                  Strategy Advisor
                </div>
                <div style={{ fontSize: 12, color: t.textDim, lineHeight: 1.5 }}>
                  Ask questions about your AI visibility data, competitive positioning, and growth strategy.
                </div>
              </div>

              <div style={{ fontSize: 11, color: t.textGhost, fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: 1 }}>
                Suggested questions
              </div>
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  style={{
                    background: t.inputBg || "rgba(255,255,255,0.04)",
                    border: `1px solid ${t.border}`,
                    borderRadius: 8, padding: "10px 14px",
                    textAlign: "left", cursor: "pointer",
                    color: t.text, fontSize: 13, lineHeight: 1.4,
                    transition: "border-color 0.2s, background 0.2s",
                  }}
                  onMouseEnter={(e) => { e.target.style.borderColor = t.brand; }}
                  onMouseLeave={(e) => { e.target.style.borderColor = t.border; }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  maxWidth: "88%",
                  padding: "10px 14px",
                  borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  background: msg.role === "user"
                    ? t.brand
                    : (t.inputBg || "rgba(255,255,255,0.04)"),
                  color: msg.role === "user" ? "#fff" : t.text,
                  fontSize: 13,
                  lineHeight: 1.55,
                  border: msg.role === "user" ? "none" : `1px solid ${t.border}`,
                }}
              >
                {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {/* Loading */}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{
                padding: "10px 14px", borderRadius: "14px 14px 14px 4px",
                background: t.inputBg || "rgba(255,255,255,0.04)",
                border: `1px solid ${t.border}`,
              }}>
                <LoadingDots t={t} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 8,
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#ef4444", fontSize: 12,
            }}>
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: "12px 18px 16px", borderTop: `1px solid ${t.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your pipeline data..."
              rows={1}
              style={{
                flex: 1, resize: "none",
                background: t.inputBg || "rgba(255,255,255,0.04)",
                border: `1px solid ${t.border}`, borderRadius: 10,
                padding: "10px 14px", fontSize: 13,
                color: t.text, fontFamily: "var(--body)",
                lineHeight: 1.4, maxHeight: 100, overflowY: "auto",
                outline: "none",
              }}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
              }}
              onFocus={(e) => { e.target.style.borderColor = t.brand; }}
              onBlur={(e) => { e.target.style.borderColor = t.border; }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                background: input.trim() && !loading ? t.brand : (t.inputBg || "rgba(255,255,255,0.04)"),
                border: "none", borderRadius: 10,
                width: 38, height: 38, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: input.trim() && !loading ? "pointer" : "default",
                color: input.trim() && !loading ? "#fff" : t.textGhost,
                fontSize: 16, transition: "background 0.2s",
              }}
            >
              &#8593;
            </button>
          </div>
          <div style={{ fontSize: 10, color: t.textGhost, marginTop: 6, textAlign: "center", fontFamily: "var(--mono)" }}>
            Enter to send &middot; Shift+Enter for new line
          </div>
        </div>
      </div>
    </>
  );
}
