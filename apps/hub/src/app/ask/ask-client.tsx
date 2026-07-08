'use client'

import { useRef, useState } from 'react'

interface ChatMessage {
  role: 'user' | 'assistant' | 'notice'
  text: string
}
interface PendingCard {
  action_id: string
  name: string
  input: Record<string, unknown>
  state: 'pending' | 'running' | 'done' | 'failed' | 'dismissed'
  result?: string
}

const ACTION_LABELS: Record<string, string> = {
  create_project: 'Create project',
  invite_member: 'Invite member',
  start_trial: 'Start trial',
  assign_licence: 'Assign a seat',
  create_folder: 'Create folder',
}

export function AskClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [cards, setCards] = useState<PendingCard[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const conversationRef = useRef<string | undefined>(undefined)

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    setMessages((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '' }])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationRef.current, message: text }),
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        setMessages((m) => {
          const copy = [...m]
          copy[copy.length - 1] = {
            role: 'assistant',
            text: data.message ?? 'Ask Plinth is unavailable right now.',
          }
          return copy
        })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line)
          if (event.type === 'meta') conversationRef.current = event.conversation_id
          if (event.type === 'text') {
            setMessages((m) => {
              const copy = [...m]
              copy[copy.length - 1] = {
                role: 'assistant',
                text: copy[copy.length - 1].text + event.text,
              }
              return copy
            })
          }
          if (event.type === 'notice') {
            setMessages((m) => [...m.slice(0, -1), { role: 'notice', text: event.text }, m[m.length - 1]])
          }
          if (event.type === 'confirm') {
            setCards((c) => [
              ...c,
              { action_id: event.action_id, name: event.name, input: event.input, state: 'pending' },
            ])
          }
          if (event.type === 'error') {
            setMessages((m) => [...m, { role: 'notice', text: event.message }])
          }
        }
      }
    } finally {
      setBusy(false)
    }
  }

  async function confirm(card: PendingCard) {
    setCards((c) => c.map((x) => (x.action_id === card.action_id ? { ...x, state: 'running' } : x)))
    const res = await fetch('/api/ai/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationRef.current, action_id: card.action_id }),
    })
    const data = await res.json().catch(() => ({}))
    setCards((c) =>
      c.map((x) =>
        x.action_id === card.action_id
          ? {
              ...x,
              state: res.ok ? 'done' : 'failed',
              result: res.ok ? 'Done.' : (data.message ?? 'That did not work.'),
            }
          : x,
      ),
    )
  }

  return (
    <>
      <div className="chat-thread">
        {messages.length === 0 && (
          <div className="card empty">
            <h3>Ask anything about your workspace</h3>
            <p>
              &ldquo;Which documents changed this week?&rdquo; · &ldquo;Who has a seat on ITP
              Engine?&rdquo; · &ldquo;Create a project for the A61 job.&rdquo;
            </p>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'notice' ? (
            <div key={i} className="notice warn" style={{ margin: 0 }}>
              {m.text}
            </div>
          ) : (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.text || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
          ),
        )}
        {cards
          .filter((c) => c.state !== 'dismissed')
          .map((card) => (
            <div key={card.action_id} className="confirm-card">
              <h4>{ACTION_LABELS[card.name] ?? card.name}</h4>
              <p style={{ fontSize: '0.85rem', margin: '0 0 0.6rem' }}>
                {Object.entries(card.input)
                  .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
                  .join(' · ')}
              </p>
              {card.state === 'pending' && (
                <>
                  <button className="btn small" onClick={() => confirm(card)}>
                    Confirm
                  </button>{' '}
                  <button
                    className="btn small ghost"
                    onClick={() =>
                      setCards((c) =>
                        c.map((x) =>
                          x.action_id === card.action_id ? { ...x, state: 'dismissed' } : x,
                        ),
                      )
                    }
                  >
                    Dismiss
                  </button>
                </>
              )}
              {card.state === 'running' && <span className="badge">Working…</span>}
              {card.state === 'done' && <span className="badge ok">{card.result}</span>}
              {card.state === 'failed' && <span className="badge danger">{card.result}</span>}
            </div>
          ))}
      </div>
      <form onSubmit={send} className="form-row" style={{ position: 'sticky', bottom: '1rem' }}>
        <div className="form-field" style={{ flex: 1 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Plinth…"
            aria-label="Ask Plinth"
          />
        </div>
        <button className="btn" type="submit" disabled={busy || !input.trim()}>
          {busy ? 'Thinking…' : 'Send'}
        </button>
      </form>
    </>
  )
}
