import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOrgContext } from '@/lib/org'
import {
  ACT_TOOL_NAMES,
  ACT_TOOLS,
  QUERY_TOOLS,
  SYSTEM_PROMPT,
  executeQueryTool,
} from '@/lib/ai/tools'
import { plinthError } from '@/lib/errors'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const SOFT_CAP_TOKENS = 200_000 // per org per day — SPEC §7
const HARD_CAP_TOKENS = SOFT_CAP_TOKENS * 2
const MAX_LOOPS = 6

const bodySchema = z.object({
  conversation_id: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
})

/**
 * Ask Plinth — SPEC §7. Streams; meters; query tools auto-execute under the
 * user's RLS; act tools become pending confirmation cards (never executed
 * here — that is the injection defence).
 */
export async function POST(request: NextRequest) {
  const ctx = await getOrgContext()
  if (!ctx) return plinthError('PLINTH_AUTH_REQUIRED')
  if (!ctx.org.ai_enabled) return plinthError('PLINTH_AI_DISABLED', 'Ask Plinth is switched off for this organisation')
  if (!process.env.ANTHROPIC_API_KEY) {
    return plinthError('PLINTH_AI_DISABLED', 'Ask Plinth is not configured in this environment')
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return plinthError('PLINTH_VALIDATION')

  const supabase = createClient()

  // Metering caps (SPEC §7): soft cap → friendly limit; hard cap → 429.
  const { data: usage } = await supabase.rpc('ai_usage_today', { p_org: ctx.organisationId })
  const usedToday =
    Number((usage?.[0] as { tokens_in?: number })?.tokens_in ?? 0) +
    Number((usage?.[0] as { tokens_out?: number })?.tokens_out ?? 0)
  if (usedToday >= HARD_CAP_TOKENS) {
    return plinthError('PLINTH_AI_LIMIT', 'Daily AI limit reached — try again tomorrow', {}, 429)
  }
  const softLimited = usedToday >= SOFT_CAP_TOKENS

  // Conversation: reuse or create (RLS scopes both to this user).
  let conversationId = parsed.data.conversation_id
  if (conversationId) {
    const { data: conv } = await supabase
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!conv) return plinthError('PLINTH_FORBIDDEN')
  } else {
    const { data: conv, error } = await supabase
      .from('ai_conversations')
      .insert({
        organisation_id: ctx.organisationId,
        user_id: ctx.user.id,
        title: parsed.data.message.slice(0, 60),
      })
      .select('id')
      .single()
    if (error || !conv) return plinthError('PLINTH_VALIDATION', 'Could not start a conversation')
    conversationId = conv.id
  }

  // History (last 30 messages) → Anthropic message list.
  const { data: history } = await supabase
    .from('ai_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(30)

  const messages: Anthropic.MessageParam[] = []
  for (const m of history ?? []) {
    const c = m.content as { text?: string }
    if ((m.role === 'user' || m.role === 'assistant') && c?.text) {
      messages.push({ role: m.role, content: c.text })
    }
  }
  messages.push({ role: 'user', content: parsed.data.message })

  await supabase.from('ai_messages').insert({
    conversation_id: conversationId,
    organisation_id: ctx.organisationId,
    role: 'user',
    content: { text: parsed.data.message },
  })

  const anthropic = new Anthropic()
  const encoder = new TextEncoder()
  const orgId = ctx.organisationId

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))

      let tokensIn = 0
      let tokensOut = 0
      let assistantText = ''
      const pendingActions: { id: string; name: string; input: unknown }[] = []

      try {
        send({ type: 'meta', conversation_id: conversationId, soft_limited: softLimited })
        if (softLimited) {
          send({
            type: 'notice',
            text: 'Heads up: your organisation is near its daily Ask Plinth limit.',
          })
        }

        let loops = 0
        let stop = false
        while (!stop && loops < MAX_LOOPS) {
          loops += 1
          const msgStream = anthropic.messages.stream({
            model: 'claude-opus-4-8',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            thinking: { type: 'adaptive' },
            tools: [...QUERY_TOOLS, ...ACT_TOOLS],
            messages,
          })

          msgStream.on('text', (delta) => {
            assistantText += delta
            send({ type: 'text', text: delta })
          })

          const response = await msgStream.finalMessage()
          tokensIn += response.usage.input_tokens
          tokensOut += response.usage.output_tokens

          const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          )
          if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
            stop = true
            break
          }

          messages.push({ role: 'assistant', content: response.content })
          const results: Anthropic.ToolResultBlockParam[] = []

          for (const tool of toolUses) {
            if (ACT_TOOL_NAMES.has(tool.name)) {
              // Act tool → confirmation card; NEVER executed from the loop.
              const actionId = randomUUID()
              pendingActions.push({ id: actionId, name: tool.name, input: tool.input })
              send({ type: 'confirm', action_id: actionId, name: tool.name, input: tool.input })
              results.push({
                type: 'tool_result',
                tool_use_id: tool.id,
                content:
                  'A confirmation card has been shown to the user. The action has NOT been executed and will only run if the user confirms it.',
              })
            } else {
              const result = await executeQueryTool(
                supabase,
                orgId,
                tool.name,
                (tool.input ?? {}) as Record<string, unknown>,
              )
              results.push({
                type: 'tool_result',
                tool_use_id: tool.id,
                content: JSON.stringify(result).slice(0, 20000),
              })
            }
          }
          messages.push({ role: 'user', content: results })
        }

        // Persist assistant turn (+ pending actions for /api/ai/confirm).
        await supabase.from('ai_messages').insert({
          conversation_id: conversationId,
          organisation_id: orgId,
          role: 'assistant',
          content: { text: assistantText, pending_actions: pendingActions },
          tokens_in: tokensIn,
          tokens_out: tokensOut,
        })
        await supabase.rpc('meter_ai_usage', {
          p_org: orgId,
          p_tokens_in: tokensIn,
          p_tokens_out: tokensOut,
          p_actions: 0,
        })

        send({ type: 'done' })
      } catch (err) {
        console.error('ai chat stream failed', err)
        send({ type: 'error', message: 'Ask Plinth hit a problem — please try again.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
