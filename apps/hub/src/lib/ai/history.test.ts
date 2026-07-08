import { describe, it, expect } from 'vitest'
import { buildAiMessages, type StoredMessage } from './history'

const u = (text: string): StoredMessage => ({ role: 'user', content: { text } })
const a = (text: string): StoredMessage => ({ role: 'assistant', content: { text } })
const actOnly = (): StoredMessage => ({ role: 'assistant', content: { text: '', pending_actions: [{ id: 'x' }] } })
const tool = (): StoredMessage => ({ role: 'tool', content: { action_id: 'x' } })

describe('buildAiMessages (Ask Plinth history reconstruction)', () => {
  it('appends the new user message to an empty history', () => {
    expect(buildAiMessages([], 'hi')).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('replays a normal alternating conversation and appends the new turn', () => {
    const out = buildAiMessages([u('q1'), a('r1')], 'q2')
    expect(out).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: 'q2' },
    ])
  })

  it('drops tool (execution-record) rows', () => {
    const out = buildAiMessages([u('q1'), a('r1'), tool()], 'q2')
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
  })

  it('replays an act-tool-only assistant turn as a placeholder (no double-user → 400)', () => {
    const out = buildAiMessages([u('create a project'), actOnly()], 'thanks')
    expect(out).toEqual([
      { role: 'user', content: 'create a project' },
      { role: 'assistant', content: '(Proposed an action for your confirmation.)' },
      { role: 'user', content: 'thanks' },
    ])
  })

  it('trims leading assistant turns (first message must be user)', () => {
    const out = buildAiMessages([a('stranded assistant'), u('q1'), a('r1')], 'q2')
    expect(out[0]).toEqual({ role: 'user', content: 'q1' })
  })

  it('folds the new message into a trailing unanswered user turn (no consecutive users)', () => {
    const out = buildAiMessages([u('q1'), a('r1'), u('unanswered')], 'more')
    expect(out).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: 'unanswered\n\nmore' },
    ])
  })

  it('never yields a message list starting with assistant or with adjacent same roles', () => {
    const out = buildAiMessages([a('x'), a('y'), u('q'), tool()], 'new')
    expect(out[0].role).toBe('user')
    for (let i = 1; i < out.length; i++) {
      expect(out[i].role).not.toBe(out[i - 1].role)
    }
  })
})
