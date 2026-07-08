import { describe, it, expect } from 'vitest'
import { QUERY_TOOLS, ACT_TOOLS, ACT_TOOL_NAMES } from './tools'

const props = (t: { input_schema: { properties?: unknown } }): Record<string, { enum?: string[] }> =>
  (t.input_schema.properties ?? {}) as Record<string, { enum?: string[] }>

/**
 * SPEC §7 defines the Ask Plinth tool schemas verbatim. This is a regression
 * guard: the names, the required arrays, and the query/act split are the
 * contract with the model and the confirmation-card flow.
 */
describe('Ask Plinth tool schemas (SPEC §7)', () => {
  it('exposes exactly the five query tools with the right required fields', () => {
    const byName = Object.fromEntries(QUERY_TOOLS.map((t) => [t.name, t]))
    expect(Object.keys(byName).sort()).toEqual(
      ['get_subscription_state', 'list_members', 'list_projects', 'search_documents', 'search_knowledge_base'].sort(),
    )
    expect(byName.search_knowledge_base.input_schema.required).toEqual(['query'])
    expect(byName.search_documents.input_schema.required).toEqual(['query'])
    expect(props(byName.list_projects).status).toMatchObject({
      enum: ['active', 'archived'],
    })
    // Parameterless tools declare no required array.
    expect(byName.get_subscription_state.input_schema.required).toBeUndefined()
    expect(byName.list_members.input_schema.required).toBeUndefined()
  })

  it('exposes exactly the five act tools with the right required fields', () => {
    const byName = Object.fromEntries(ACT_TOOLS.map((t) => [t.name, t]))
    expect(Object.keys(byName).sort()).toEqual(
      ['assign_licence', 'create_folder', 'create_project', 'invite_member', 'start_trial'].sort(),
    )
    expect(byName.create_project.input_schema.required).toEqual(['name'])
    expect(byName.invite_member.input_schema.required).toEqual(['email', 'role'])
    expect(props(byName.invite_member).role).toMatchObject({
      enum: ['admin', 'member', 'viewer'],
    })
    expect(byName.start_trial.input_schema.required).toEqual(['app_slug'])
    expect(byName.assign_licence.input_schema.required).toEqual(['app_slug', 'user_email'])
    expect(byName.create_folder.input_schema.required).toEqual(['project_id', 'name'])
  })

  it('act and query tool names are disjoint; ACT_TOOL_NAMES matches ACT_TOOLS', () => {
    const queryNames = new Set(QUERY_TOOLS.map((t) => t.name))
    for (const t of ACT_TOOLS) expect(queryNames.has(t.name)).toBe(false)
    expect([...ACT_TOOL_NAMES].sort()).toEqual(ACT_TOOLS.map((t) => t.name).sort())
  })
})
