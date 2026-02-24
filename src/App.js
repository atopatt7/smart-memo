import { useState, useRef, useEffect } from "react";

const STORAGE_KEY = "smart-memo-notes";
const API_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;

const systemPrompt = `你是一個聰明的個人助理。用戶會給你一些工作備忘、待辦事項、靈感或瑣碎細節。
你的任務：
1. 當用戶輸入備忘時，確認你已記錄，並給予簡短回應。
2. 當用戶詢問「還有什麼沒做」、「我的待辦」、「幫我整理」等問題時，根據所有備忘內容，聰明地整理出：
   - 📋 未完成的待辦清單
   - 💡 值得注意的靈感或細節
   - ⚡ 建議優先處理的事項
3. 回答要簡潔、有條理，用繁體中文回應。
4. 如果用戶說某件事「完成了」或「做完了」，在整理時把它從待辦中移除。`;

export default function App() {
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "嗨！我是你的智能備忘助理 👋\n你可以把任何工作細節、待辦、靈感丟給我。需要整理時，就問我「我還有什麼沒做？」",
  }]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch {}
  }, [notes]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");

    const newNote = { text: userMsg, time: new Date().toLocaleString("zh-TW"), id: Date.now() };
    const updatedNotes = [...notes, newNote];
    setNotes(updatedNotes);

    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    const notesContext = updatedNotes.map((n, i) => `[${i + 1}] ${n.time}: ${n.text}`).join("\n");
    const contextMessage = `【目前所有備忘紀錄】\n${notesContext}\n\n【用戶的新輸入】\n${userMsg}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-calls": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            ...newMessages.slice(1, -1).map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: contextMessage },
          ],
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages([...newMessages, { role: "assistant", content: `錯誤：${data.error.type}\n${data.error.message}` }]);
      } else {
        const reply = data.content?.[0]?.text || "抱歉，發生錯誤。";
        setMessages([...newMessages, { role: "assistant", content: reply }]);
      }
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: `連線失敗：${err.message}\nAPI Key 狀態：${API_KEY ? "已設定（長度" + API_KEY.length + "）" : "未設定"}` }]);
    }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const deleteNote = (id) => setNotes(notes.filter((n) => n.id !== id));
  const clearAll = () => { if (window.confirm("確定清除所有備忘？")) setNotes([]); };

  return (
    <div style={{ minHeight: "100dvh", background: "#0f0f0f", fontFamily: "'Noto Sans TC','PingFang TC',sans-serif", color: "#e8e2d9", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        .tab-btn { background: none; border: none; color: #666; cursor: pointer; padding: 8px 20px; font-size: 14px; font-family: inherit; transition: all 0.2s; border-bottom: 2px solid transparent; letter-spacing: 1px; }
        .tab-btn.active { color: #e8c87a; border-color: #e8c87a; }
        .tab-btn:hover { color: #e8e2d9; }
        .send-btn { background: #e8c87a; border: none; border-radius: 8px; width: 44px; height: 44px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
        .send-btn:hover:not(:disabled) { background: #f0d894; }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .note-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; position: relative; }
        .del-btn { background: none; border: none; color: #555; cursor: pointer; position: absolute; right: 10px; top: 10px; font-size: 18px; line-height: 1; transition: color 0.2s; padding: 4px; }
        .del-btn:hover { color: #e87a7a; }
        .msg-bubble { max-width: 85%; padding: 12px 16px; border-radius: 12px; line-height: 1.7; white-space: pre-wrap; font-size: 14px; }
        .msg-user { background: #222; margin-left: auto; border-radius: 12px 12px 2px 12px; }
        .msg-ai { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px 12px 12px 2px; }
        textarea { background: none; border: none; outline: none; resize: none; color: #e8e2d9; font-family: inherit; font-size: 15px; line-height: 1.6; flex: 1; max-height: 120px; }
        textarea::placeholder { color: #444; }
        .quick-btn { background: none; border: 1px solid #2a2a2a; color: #666; padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.2s; white-space: nowrap; }
        .quick-btn:hover { border-color: #e8c87a; color: #e8c87a; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "env(safe-area-inset-top, 12px) 20px 0", paddingTop: "max(env(safe-area-inset-top), 12px)", borderBottom: "1px solid #1e1e1e", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 300, letterSpacing: 3 }}>備忘助理</h1>
          <span style={{ fontSize: 10, color: "#555", letterSpacing: 2 }}>SMART MEMO</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#666", background: "#1a1a1a", border: "1px solid #2a2a2a", padding: "2px 10px", borderRadius: 20 }}>
            {notes.length} 則
          </span>
        </div>
        <div style={{ display: "flex" }}>
          <button className={`tab-btn ${activeTab === "chat" ? "active" : ""}`} onClick={() => setActiveTab("chat")}>對話</button>
          <button className={`tab-btn ${activeTab === "notes" ? "active" : ""}`} onClick={() => setActiveTab("notes")}>備忘庫</button>
        </div>
      </div>

      {/* Messages / Notes */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: activeTab === "chat" ? 12 : 0 }}>
        {activeTab === "chat" ? (
          <>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div className={`msg-bubble ${m.role === "user" ? "msg-user" : "msg-ai"}`}>
                  {m.role === "assistant" && <div style={{ fontSize: 10, color: "#e8c87a", letterSpacing: 2, marginBottom: 6 }}>AI</div>}
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex" }}>
                <div className="msg-bubble msg-ai">
                  <div style={{ fontSize: 10, color: "#e8c87a", letterSpacing: 2, marginBottom: 6 }}>AI</div>
                  <span style={{ color: "#555" }}>思考中⋯</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        ) : (
          <>
            {notes.length === 0 ? (
              <div style={{ textAlign: "center", color: "#444", marginTop: 60, fontSize: 14 }}>還沒有備忘紀錄</div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                  <button onClick={clearAll} style={{ background: "none", border: "1px solid #333", color: "#666", padding: "4px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>清除全部</button>
                </div>
                {[...notes].reverse().map((n) => (
                  <div key={n.id} className="note-card">
                    <div style={{ fontSize: 10, color: "#555", marginBottom: 6, letterSpacing: 1 }}>{n.time}</div>
                    <div style={{ fontSize: 14, lineHeight: 1.6, paddingRight: 28 }}>{n.text}</div>
                    <button className="del-btn" onClick={() => deleteNote(n.id)}>×</button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Quick prompts + Input */}
      {activeTab === "chat" && (
        <div style={{ flexShrink: 0, borderTop: "1px solid #1e1e1e", padding: "10px 20px", paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
            {["我還有什麼沒做？", "整理優先順序", "有什麼靈感？"].map((q) => (
              <button key={q} className="quick-btn" onClick={() => { setInput(q); textareaRef.current?.focus(); }}>{q}</button>
            ))}
          </div>
          <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea ref={textareaRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey} placeholder="輸入待辦、靈感、細節⋯" />
            <button className="send-btn" onClick={send} disabled={loading || !input.trim()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f0f0f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
