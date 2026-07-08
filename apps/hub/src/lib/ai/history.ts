import type Anthropic from '@anthropic-ai/sdk'

export interface StoredMessage {
  role: string
  content: { text?: string; pending_actions?: unknown[] } | unknown
}

/**
 * Rebuild a valid Anthropic message list from stored transcript rows + the
 * new user message. Encodes the SPEC §7 / review-fix invariants:
 *  - only user/assistant turns are replayed (tool rows are execution records);
 *  - an assistant turn that only proposed an act-tool card (empty text) is
 *    replayed as a placeholder so roles keep alternating;
 *  - leading assistant turns are trimmed (the API requires the first message
 *    to be `user`);
 *  - if the last replayed turn is a user turn, the new message folds into it
 *    rather than creating two consecutive user turns.
 *
 * `history` must already be in chronological (oldest→newest) order.
 */
export function buildAiMessages(
  history: StoredMessage[],
  newMessage: string,
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = []
  for (const m of history) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const c = (m.content ?? {}) as { text?: string; pending_actions?: unknown[] }
    const text =
      c.text ||
      (m.role === 'assistant' && (c.pending_actions?.length ?? 0) > 0
        ? '(Proposed an action for your confirmation.)'
        : '')
    if (!text) continue
    messages.push({ role: m.role, content: text })
  }
  while (messages.length > 0 && messages[0].role === 'assistant') messages.shift()

  if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
    const prev = messages[messages.length - 1]
    prev.content = `${prev.content as string}\n\n${newMessage}`
  } else {
    messages.push({ role: 'user', content: newMessage })
  }
  return messages
}
