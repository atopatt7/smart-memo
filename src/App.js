import { useState, useRef, useEffect } from "react";

const STORAGE_KEY = "smart-memo-notes-v2";
const API_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;

const systemPrompt = `你是一個聰明的個人助理。用戶會給你工作備忘、待辦事項、靈感或瑣碎細節。

你的任務：
1. 分析每則新輸入，判斷它的類型和歸屬
2. 當用戶詢問整理、待辦、優先順序時，給出有條理的分析

分類規則：
- "todo"：明確的待辦事項、任務、需要完成的事
- "idea"：靈感、想法、備忘、細節、參考資訊

如果是 idea，嘗試找出它最相關的現有待辦事項標題，放在 relatedTodo 欄位（字串，若找不到相關待辦則為 null）

回應格式（必須是合法 JSON）：
{
  "type": "todo" | "idea",
  "relatedTodo": "相關待辦的標題" | null,
  "reply": "給用戶看的回覆文字"
}

若用戶在問整理/查詢（非輸入新備忘），回應格式：
{
  "type": "query",
  "relatedTodo": null,
  "reply": "整理後的回覆"
}

用繁體中文回應。`;

const isQueryMessage = (text) => {
  const keywords = ["還有什麼", "待辦", "整理", "優先", "沒做", "靈感", "幫我看", "總結", "有哪些"];
  return keywords.some((k) => text.includes(k));
};

export default function App() {
  const [todos, setTodos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY + "-todos") || "[]"); } catch { return []; }
  });
  const [ideas, setIdeas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY + "-ideas") || "[]"); } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "嗨！我是你的智能備忘助理 👋\n輸入任何待辦或靈感，我會自動幫你分類整理。",
  }]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY + "-todos", JSON.stringify(todos)); } catch {}
  }, [todos]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY + "-ideas", JSON.stringify(ideas)); } catch {}
  }, [ideas]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");

    const newMessages = [...messages, { role: "user", content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    const todosContext = todos.map((t, i) => "[待辦" + (i+1) + "] " + t.title).join("\n");
    const ideasContext = ideas.map((d) => "- " + d.text + "（歸類：" + (d.relatedTodo || "未歸類") + "）").join("\n");

    const contextMessage = isQueryMessage(userMsg)
      ? "【現有待辦清單】\n" + (todosContext || "（空）") + "\n\n【現有靈感備忘】\n" + (ideasContext || "（空）") + "\n\n【用戶問題】\n" + userMsg
      : "【現有待辦清單】\n" + (todosContext || "（空）") + "\n\n【用戶新輸入】\n" + userMsg;

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
          messages: [{ role: "user", content: contextMessage }],
        }),
      });
      const data = await res.json();
      const rawText = data.content?.[0]?.text || "{}";

      let parsed;
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
      } catch {
        parsed = { type: "query", reply: rawText };
      }

      const { type, relatedTodo, reply } = parsed;

      if (type === "todo") {
        const newTodo = { id: Date.now(), title: userMsg, time: new Date().toLocaleString("zh-TW") };
        setTodos((prev) => [...prev, newTodo]);
      } else if (type === "idea") {
        const newIdea = { id: Date.now(), text: userMsg, relatedTodo: relatedTodo || null, time: new Date().toLocaleString("zh-TW") };
        setIdeas((prev) => [...prev, newIdea]);
      }

      setMessages([...newMessages, { role: "assistant", content: reply, tag: type }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "連線失敗，請確認 API Key 是否正確。" }]);
    }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const deleteTodo = (id) => {
    const todo = todos.find((t) => t.id === id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
    if (todo) setIdeas((prev) => prev.map((i) => i.relatedTodo === todo.title ? { ...i, relatedTodo: null } : i));
  };
  const deleteIdea = (id) => setIdeas((prev) => prev.filter((i) => i.id !== id));

  const ungroupedIdeas = ideas.filter((i) => !i.relatedTodo || !todos.find((t) => t.title === i.relatedTodo));

  const typeLabel = (tag) => {
    if (tag === "todo") return { text: "📋 新增待辦", color: "#e8c87a" };
    if (tag === "idea") return { text: "💡 靈感已歸類", color: "#7ac8e8" };
    return null;
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#0d0d0d", fontFamily: "'Noto Sans TC','PingFang TC',sans-serif", color: "#e8e2d9", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        .tab-btn { background: none; border: none; color: #555; cursor: pointer; padding: 8px 20px; font-size: 13px; font-family: inherit; transition: all 0.2s; border-bottom: 2px solid transparent; letter-spacing: 1.5px; }
        .tab-btn.active { color: #e8c87a; border-color: #e8c87a; }
        .tab-btn:hover { color: #e8e2d9; }
        .send-btn { background: #e8c87a; border: none; border-radius: 8px; width: 42px; height: 42px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
        .send-btn:hover:not(:disabled) { background: #f0d894; transform: scale(1.05); }
        .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .msg-bubble { max-width: 85%; padding: 12px 16px; border-radius: 12px; line-height: 1.75; white-space: pre-wrap; font-size: 14px; }
        .msg-user { background: #1e1e1e; border: 1px solid #2a2a2a; margin-left: auto; border-radius: 12px 12px 2px 12px; }
        .msg-ai { background: #161616; border: 1px solid #242424; border-radius: 12px 12px 12px 2px; }
        textarea { background: none; border: none; outline: none; resize: none; color: #e8e2d9; font-family: inherit; font-size: 15px; line-height: 1.6; flex: 1; max-height: 120px; }
        textarea::placeholder { color: #3a3a3a; }
        .quick-btn { background: none; border: 1px solid #222; color: #555; padding: 5px 14px; border-radius: 20px; cursor: pointer; font-size: 12px; font-family: inherit; transition: all 0.2s; white-space: nowrap; }
        .quick-btn:hover { border-color: #e8c87a44; color: #e8c87a; }
        .todo-group { border: 1px solid #1e1e1e; border-radius: 10px; margin-bottom: 16px; overflow: hidden; }
        .todo-header { background: #161616; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e1e1e; }
        .idea-chip { background: #111; border-left: 2px solid #7ac8e833; padding: 10px 14px; }
        .idea-chip + .idea-chip { border-top: 1px solid #1a1a1a; }
        .del-btn { background: none; border: none; color: #333; cursor: pointer; font-size: 16px; padding: 2px 6px; transition: color 0.2s; }
        .del-btn:hover { color: #e87a7a; }
        .badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 20px; letter-spacing: 1px; margin-bottom: 5px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "max(env(safe-area-inset-top), 14px) 20px 0", borderBottom: "1px solid #181818", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h1 style={{ fontSize: 17, fontWeight: 300, letterSpacing: 4, color: "#e8e2d9" }}>備忘助理</h1>
          <span style={{ fontSize: 9, color: "#444", letterSpacing: 2 }}>SMART MEMO</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#e8c87a", background: "#e8c87a11", border: "1px solid #e8c87a22", padding: "2px 10px", borderRadius: 20 }}>
              {todos.length} 待辦
            </span>
            <span style={{ fontSize: 11, color: "#7ac8e8", background: "#7ac8e811", border: "1px solid #7ac8e822", padding: "2px 10px", borderRadius: 20 }}>
              {ideas.length} 靈感
            </span>
          </div>
        </div>
        <div style={{ display: "flex" }}>
          <button className={"tab-btn" + (activeTab === "chat" ? " active" : "")} onClick={() => setActiveTab("chat")}>對話</button>
          <button className={"tab-btn" + (activeTab === "notes" ? " active" : "")} onClick={() => setActiveTab("notes")}>備忘庫</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: activeTab === "chat" ? 12 : 0 }}>
        {activeTab === "chat" ? (
          <>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" && (() => {
                  const lbl = typeLabel(m.tag);
                  return lbl ? (
                    <span className="badge" style={{ background: lbl.color + "18", border: "1px solid " + lbl.color + "33", color: lbl.color }}>
                      {lbl.text}
                    </span>
                  ) : null;
                })()}
                <div className={"msg-bubble " + (m.role === "user" ? "msg-user" : "msg-ai")}>
                  {m.role === "assistant" && <div style={{ fontSize: 9, color: "#e8c87a", letterSpacing: 2, marginBottom: 6 }}>AI</div>}
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex" }}>
                <div className="msg-bubble msg-ai">
                  <div style={{ fontSize: 9, color: "#e8c87a", letterSpacing: 2, marginBottom: 6 }}>AI</div>
                  <span style={{ color: "#444" }}>分析中⋯</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        ) : (
          <>
            {todos.length === 0 && ideas.length === 0 ? (
              <div style={{ textAlign: "center", color: "#333", marginTop: 60, fontSize: 13 }}>
                還沒有任何記錄<br />
                <span style={{ fontSize: 11, marginTop: 6, display: "block" }}>回到對話頁面開始輸入吧</span>
              </div>
            ) : (
              <>
                {todos.map((todo) => {
                  const relatedIdeas = ideas.filter((i) => i.relatedTodo === todo.title);
                  return (
                    <div key={todo.id} className="todo-group">
                      <div className="todo-header">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#e8c87a", display: "inline-block", flexShrink: 0 }}></span>
                          <span style={{ fontSize: 14, fontWeight: 400, color: "#e8e2d9" }}>{todo.title}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {relatedIdeas.length > 0 && (
                            <span style={{ fontSize: 10, color: "#7ac8e8", background: "#7ac8e811", padding: "2px 8px", borderRadius: 20 }}>
                              {relatedIdeas.length} 則靈感
                            </span>
                          )}
                          <button className="del-btn" onClick={() => deleteTodo(todo.id)}>×</button>
                        </div>
                      </div>
                      {relatedIdeas.length === 0 ? (
                        <div style={{ padding: "10px 14px", fontSize: 12, color: "#2a2a2a" }}>尚無相關靈感</div>
                      ) : (
                        relatedIdeas.map((idea) => (
                          <div key={idea.id} className="idea-chip">
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontSize: 9, color: "#7ac8e855", marginBottom: 3, letterSpacing: 1 }}>💡 靈感</div>
                                <div style={{ color: "#aaa", fontSize: 13, lineHeight: 1.6 }}>{idea.text}</div>
                              </div>
                              <button className="del-btn" style={{ marginLeft: 8, flexShrink: 0 }} onClick={() => deleteIdea(idea.id)}>×</button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}

                {ungroupedIdeas.length > 0 && (
                  <div className="todo-group">
                    <div className="todo-header">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#444", display: "inline-block" }}></span>
                        <span style={{ fontSize: 14, color: "#666" }}>未歸類靈感</span>
                      </div>
                    </div>
                    {ungroupedIdeas.map((idea) => (
                      <div key={idea.id} className="idea-chip">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 9, color: "#55555588", marginBottom: 3, letterSpacing: 1 }}>💡 靈感</div>
                            <div style={{ color: "#777", fontSize: 13, lineHeight: 1.6 }}>{idea.text}</div>
                          </div>
                          <button className="del-btn" style={{ marginLeft: 8, flexShrink: 0 }} onClick={() => deleteIdea(idea.id)}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Input */}
      {activeTab === "chat" && (
        <div style={{ flexShrink: 0, borderTop: "1px solid #181818", padding: "10px 20px", paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, overflowX: "auto", paddingBottom: 2 }}>
            {["我還有什麼沒做？", "整理優先順序", "有哪些靈感？"].map((q) => (
              <button key={q} className="quick-btn" onClick={() => { setInput(q); textareaRef.current?.focus(); }}>{q}</button>
            ))}
          </div>
          <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 12, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea ref={textareaRef} rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey} placeholder="輸入待辦、靈感、細節⋯" />
            <button className="send-btn" onClick={send} disabled={loading || !input.trim()}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0d0d0d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
