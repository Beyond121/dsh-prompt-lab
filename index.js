/**
 * Prompt Lab Host half: rewrites every entry the system prompt assembly injects
 * by default, shadows overridden runtime contexts at the owning agent scope,
 * captures the exact requests the Agent loop sends to the LLM layer, persists
 * named override profiles, and serves the browser page over a same-origin route.
 *
 * Dependency-free by design: a profile-linked bundle resolves only Node built-ins.
 *
 * @module @local/dsh-prompt-lab
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'

export const name = 'prompt-lab'

export const inject = ['systemPrompt', 'llm', 'agents', 'tools']

/** DSH version whose shipped constants the static reference texts were read from. */
const REFERENCE_VERSION = '0.2.2-rc.3'

/**
 * Static reference texts for entries whose live default is state-dependent and
 * therefore empty until activated. Shown as "reference" only; the live text
 * always wins when present. Sources name the owning package or preset file.
 */
const REFERENCE_TEXTS = {
  'plan:policy': {
    source: `standard preset plan-mode section`,
    text: [
      'You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user\'s conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.',
      '',
      'Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.',
      '',
      'The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.',
      '',
      'Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.',
      '',
      'Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.',
      '',
      'When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.',
    ].join('\n'),
  },
  'team:policy': {
    source: 'dsh-tool-agent-team TEAM_POLICY',
    text: [
      'Agent Teams is available in this session.',
      '',
      'The Team Lead and all teammates share the same working directory and filesystem. Edits are immediately visible to every member. Split write work into disjoint scopes, record expected write scopes on shared tasks, and use task dependencies when work must be ordered. Write-scope overlap is advisory, not a lock.',
      '',
      'Use the names returned by subagent, subagent_fork, or list_agents as owner when assigning or filtering shared tasks. The root can reassign tasks to itself or any continuable descendant; other agents claim ready tasks themselves. Shared-task workflow is list, get, claim with the current revision, perform the work, then complete. Task readiness never starts an owner. The root agent must wait for required teammates before giving the final answer.',
      '',
      'Task changes do not end wait_agent calls, add inbox messages, or start idle agents. Use send_message when another agent needs to act on a task.',
    ].join('\n'),
  },
  'mcp-resource-servers': {
    source: 'dsh-mcp-resources template',
    text: [
      '## MCP resource servers',
      '',
      'Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names as the server argument: ["<server>", ...].',
    ].join('\n'),
  },
  'tool:subagent:depth': {
    source: 'dsh-tool-subagent template',
    text: 'Delegation depth for `<tool>`: current <depth>, maximum <max>, remaining levels 0.',
  },
  'tool:subagent_fork:depth': {
    source: 'dsh-tool-subagent template',
    text: 'Delegation depth for `<tool>`: current <depth>, maximum <max>, remaining levels 0.',
  },
  'tool:subagent_fork': {
    source: 'dsh-tool-subagent section (shared body)',
    text: [
      'Start independent delegations with `subagent` or `subagent_fork` together in one assistant message and continue useful work while they run. When only waiting for their results remains, end your turn instead of sleeping or polling; the next result starts a new turn. Collect the subagent results required to complete the task before giving the user a final answer.',
      '',
      'Bash, formatters, code generators, and scripts can overwrite concurrent edits without conflict detection; coordinate their changes explicitly. The agent integrating the work must review the final diff and run relevant tests.',
    ].join('\n'),
  },
  'compaction:user': {
    source: 'dsh-compaction-basic COMPACTION_INSTRUCTION',
    text: [
      'You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.',
      '',
      'Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.',
      '',
      '## Primary Request and Intent',
      "- [the user's original and evolving goals; quote verbatim where the exact wording matters]",
      '',
      '## Key Technical Concepts',
      '- [technologies, frameworks, patterns, and conventions in play]',
      '',
      '## Files and Code',
      '- [exact path: why it matters, key changes or snippets]',
      '',
      '## Errors and Fixes',
      '- [error: how it was resolved, plus any related user feedback]',
      '',
      '## Pending Jobs',
      '- [explicitly requested work not yet completed]',
      '',
      '## Current Work',
      '- [precisely what was in progress at this checkpoint]',
      '',
      '## Next Step',
      '- [the single next action, directly in line with the most recent request, or "(none)"]',
      '',
      '## Critical Context',
      '- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]',
      '',
      'Rules:',
      '- Write concise English engineering prose. Preserve exact file paths, commands, error strings, identifiers, numeric values, function signatures, and syntax fragments.',
      '- Capture user feedback and explicit instructions faithfully, especially corrections.',
      '- Do NOT mention this summarization request or that the context was compacted.',
      '- Output only the checkpoint text: do not call any tool or take any other action.',
      '- If the conversation already contains a <compacted-summary> block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.',
    ].join('\n'),
  },
  'session-title:system': {
    source: 'dsh-session-title-first-prompt-llm systemPrompt()',
    text: [
      'Create a concise title for an AI coding-assistant session from the supplied human messages.',
      'Return only the title on one line, **in plain text of natural language**, with no quotes, prefix, explanation, Markdown, XML, or terminal control codes. No code is allowed.',
      'Use the language of the messages.',
      'Aim for about <targetWords> words in non-CJK languages or <targetCjkCharacters> CJK characters.',
      'If the messages give little to name, still return a short best-effort title, such as Greeting, instead of explaining.',
    ].join('\n'),
  },
  'session-title:user': {
    source: 'dsh-session-title-first-prompt-llm frameMessages()',
    text: 'Generate the session title from this JSON array of human messages:\n<JSON array of the selected human messages>',
  },
}
const DEFAULT_CONTEXT_ORDERS = {
  'working-directory:current': 100,
  'sandbox:policy': 110,
  'approval:policy': 115,
  'subagent:identity': 120,
  'tool:subagent:depth': 120,
  'tool:subagent_fork:depth': 120,
  'harness:source': 200,
  'app:web-surface': 210,
}

const STATE_FILE = join(import.meta.dirname, 'state.json')
const API_PATH = '/prompt-lab/api'
const EMPTY_PROFILE = {
  sectionOverrides: {},
  contextOverrides: {},
  variableOverrides: {},
  toolDescriptionOverrides: {},
  scenarioPromptOverrides: {},
}

const KIND_FIELDS = {
  section: 'sectionOverrides',
  context: 'contextOverrides',
  variable: 'variableOverrides',
  tool: 'toolDescriptionOverrides',
  scenario: 'scenarioPromptOverrides',
}

/** Deep-copy a value into lossless JSON: undefined and functions become null. */
function jsonSafe(value) {
  if (value === undefined || typeof value === 'function') return null
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(jsonSafe)
  const copy = {}
  for (const [key, entry] of Object.entries(value)) copy[key] = jsonSafe(entry)
  return copy
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Coerce one external map into name -> string entries. */
function stringMap(value) {
  const map = {}
  if (!isRecord(value)) return map
  for (const [key, entry] of Object.entries(value)) if (typeof entry === 'string') map[key] = entry
  return map
}

/** Coerce one external map into name -> finite number entries. */
function numberMap(value) {
  const map = {}
  if (!isRecord(value)) return map
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) map[key] = entry
  }
  return map
}

/** Coerce one stored profile into its string maps. */
function normalizeProfile(raw) {
  const source = isRecord(raw) ? raw : {}
  return {
    sectionOverrides: stringMap(source.sectionOverrides),
    contextOverrides: stringMap(source.contextOverrides),
    variableOverrides: stringMap(source.variableOverrides),
    toolDescriptionOverrides: stringMap(source.toolDescriptionOverrides),
    scenarioPromptOverrides: stringMap(source.scenarioPromptOverrides),
  }
}

/** Merge persisted state over the defaults, including the legacy single-profile shape. */
function normalizeState(raw) {
  const source = isRecord(raw) ? raw : {}
  const profiles = {}
  if (isRecord(source.profiles)) {
    for (const [profileName, profile] of Object.entries(source.profiles)) profiles[profileName] = normalizeProfile(profile)
  }
  if (Object.keys(profiles).length === 0) {
    // Legacy layout: one implicit profile under the old top-level maps.
    profiles.default = normalizeProfile(source)
  }
  if (profiles.default === undefined) profiles.default = normalizeProfile(undefined)
  let activeProfile = typeof source.activeProfile === 'string' && source.activeProfile in profiles ? source.activeProfile : 'default'
  return {
    enabled: source.enabled !== false,
    toolEnabled: source.toolEnabled !== false,
    captureMax: Number.isSafeInteger(source.captureMax) && source.captureMax > 0 ? source.captureMax : 8,
    activeProfile,
    profiles,
    contextOrders: { ...DEFAULT_CONTEXT_ORDERS, ...numberMap(source.contextOrders) },
  }
}

/** Read this plugin's persisted state; an unreadable file falls back to defaults. */
function readState() {
  try {
    return normalizeState(JSON.parse(readFileSync(STATE_FILE, 'utf8')))
  } catch {
    return normalizeState(undefined)
  }
}

/** Atomically write this plugin's persisted state. */
function writeState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true })
  const temporary = `${STATE_FILE}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  renameSync(temporary, STATE_FILE)
}

/** Copy a profile's maps into a fresh plain object. */
function cloneProfile(profile) {
  return {
    sectionOverrides: { ...profile.sectionOverrides },
    contextOverrides: { ...profile.contextOverrides },
    variableOverrides: { ...profile.variableOverrides },
    toolDescriptionOverrides: { ...profile.toolDescriptionOverrides },
    scenarioPromptOverrides: { ...profile.scenarioPromptOverrides },
  }
}

/**
 * Mount the lab: rewrite assemblies, shadow overrides, capture requests, serve
 * the page API, and expose the `prompt_lab` tool.
 * @param ctx - plugin context providing prompt, model, agent, tool and web services.
 * @param _config - Loader row config; runtime state lives in state.json.
 */
export function apply(ctx, _config) {
  /** Live state shared by listeners, shadows, HTTP handlers and the page. */
  let state = readState()
  /** scopeKey -> { sections, contexts, variables, tools } observed before rewrite. */
  const observed = new Map()
  /** sessionId -> request snapshots, newest first. */
  const captured = new Map()
  /** sessionId -> Map<shadowKey, disposer | {dispose, description}>. */
  const shadows = new Map()
  let sequence = 0
  const diagnostics = []

  /** In-memory hygiene for long-running processes. */
  const MAX_TRACKED_SESSIONS = 24
  const PENDING_WRITE_TTL_MS = 10 * 60 * 1000
  const MAX_PENDING_WRITES = 64

  const note = (message) => {
    if (diagnostics.length < 64) diagnostics.push(message)
  }

  const persist = () => {
    try {
      writeState(state)
    } catch (error) {
      note(`state write failed: ${String(error?.message ?? error)}`)
    }
  }

  /** Re-apply the prompt_lab tool registration after the toolEnabled toggle. */
  let syncTool = () => {}

  /** Overrides of the currently active profile. */
  const current = () => state.profiles[state.activeProfile] ?? normalizeProfile(undefined)

  const scopeOf = (key) => {
    let scope = observed.get(key)
    if (scope === undefined) {
      scope = { sections: new Map(), contexts: new Map(), variables: new Map(), tools: new Map() }
      observed.set(key, scope)
    } else {
      // Refresh recency so the cap evicts the least recently assembled scope.
      observed.delete(key)
      observed.set(key, scope)
    }
    while (observed.size > MAX_TRACKED_SESSIONS) {
      const oldest = observed.keys().next().value
      if (oldest === key) break
      observed.delete(oldest)
    }
    return scope
  }

  const shadowMap = (key) => {
    let scoped = shadows.get(key)
    if (scoped === undefined) {
      scoped = new Map()
      shadows.set(key, scoped)
    }
    return scoped
  }

  /** Register one agent-scoped context entry per overridden name so scope re-resolution keeps the override. */
  const ensureContextShadows = (agent, scope) => {
    const key = String(agent.session.id)
    const scoped = shadowMap(key)
    const overrides = current().contextOverrides
    for (const entryName of Object.keys(overrides)) {
      if (scoped.has(entryName)) continue
      const entry = scope.contexts.get(entryName)
      const orders = state.contextOrders
      // Exact original position for known names; observed-position estimate otherwise.
      const order = entryName in orders ? orders[entryName] : [...scope.contexts.keys()].indexOf(entryName) * 100
      try {
        scoped.set(entryName, agent.ctx.systemPrompt.context({
          name: entryName,
          order,
          interpolate: entry?.interpolate !== false,
          text: () => current().contextOverrides[entryName] ?? '',
        }))
      } catch (error) {
        note(`context shadow ${entryName}: ${String(error?.message ?? error)}`)
      }
    }
    for (const [entryName, dispose] of [...scoped]) {
      if (entryName.startsWith('tool:')) continue
      if (!(entryName in overrides)) {
        dispose()
        scoped.delete(entryName)
      }
    }
  }

  /** Register a scoped copy of each overridden tool definition carrying the replacement description. */
  const ensureToolShadows = (agent, scope) => {
    const scoped = shadowMap(String(agent.session.id))
    const overrides = current().toolDescriptionOverrides
    for (const toolName of Object.keys(overrides)) {
      const shadowKey = `tool:${toolName}`
      const description = overrides[toolName]
      const existing = scoped.get(shadowKey)
      if (existing !== undefined && existing.description === description) continue
      if (existing !== undefined) {
        existing.dispose()
        scoped.delete(shadowKey)
      }
      try {
        const definition = ctx.tools.get(toolName, agent)
        if (definition === undefined) {
          note(`tool shadow ${toolName}: no visible definition for this scope`)
          continue
        }
        const observedTool = scope.tools.get(toolName)
        if (observedTool === undefined) scope.tools.set(toolName, { defaultDescription: definition.description })
        else if (observedTool.defaultDescription === undefined) observedTool.defaultDescription = definition.description
        const dispose = agent.ctx.tools.register({ ...definition, description })
        scoped.set(shadowKey, { dispose, description })
      } catch (error) {
        note(`tool shadow ${toolName}: ${String(error?.message ?? error)}`)
      }
    }
    for (const [shadowKey, existing] of [...scoped]) {
      if (!shadowKey.startsWith('tool:')) continue
      if (!(shadowKey.slice(5) in overrides)) {
        existing.dispose()
        scoped.delete(shadowKey)
      }
    }
  }

  /** Record the pre-rewrite entries, shadow overridden ones at agent scope, then rewrite this assembly. */
  const transform = (assembly, context) => {
    if (!state.enabled) return
    const agent = context.agent
    const scope = scopeOf(agent === undefined ? 'global' : String(agent.session.id))
    const overrides = current()

    for (const section of assembly.sections) {
      if (!scope.sections.has(section.name)) {
        scope.sections.set(section.name, { defaultText: section.text, interpolate: section.interpolate !== false })
      }
    }
    for (const entry of assembly.contexts) {
      if (!scope.contexts.has(entry.name)) {
        scope.contexts.set(entry.name, { defaultText: entry.text, interpolate: entry.interpolate !== false })
      }
    }
    for (const variableName of Object.keys(assembly.variables)) {
      if (!scope.variables.has(variableName)) scope.variables.set(variableName, assembly.variables[variableName])
    }

    if (agent !== undefined && Object.keys(overrides.contextOverrides).length > 0) ensureContextShadows(agent, scope)
    if (agent !== undefined && Object.keys(overrides.toolDescriptionOverrides).length > 0) ensureToolShadows(agent, scope)

    if (Object.keys(overrides.sectionOverrides).length > 0) {
      assembly.sections = assembly.sections.map(section =>
        section.name in overrides.sectionOverrides ? { ...section, text: overrides.sectionOverrides[section.name] } : section)
    }
    if (Object.keys(overrides.contextOverrides).length > 0) {
      assembly.contexts = assembly.contexts.map(entry =>
        entry.name in overrides.contextOverrides ? { ...entry, text: overrides.contextOverrides[entry.name] } : entry)
    }
    if (Object.keys(overrides.variableOverrides).length > 0) {
      for (const variableName of Object.keys(overrides.variableOverrides)) {
        if (variableName in assembly.variables) assembly.variables[variableName] = overrides.variableOverrides[variableName]
      }
    }
  }

  /** Snapshot one exact model request before the adapter serializes it. */
  const remember = (options) => {
    if (!state.enabled) return
    const key = options.sessionId === undefined ? 'global' : String(options.sessionId)
    const snapshots = captured.get(key) ?? []
    snapshots.unshift({
      id: `req-${++sequence}`,
      at: new Date().toISOString(),
      sessionId: key,
      profile: state.activeProfile,
      purpose: options.purpose ?? 'conversation',
      provider: options.provider,
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      system: options.system,
      messages: jsonSafe(structuredClone(options.messages)),
      tools: options.tools === undefined ? undefined : jsonSafe(structuredClone(options.tools)),
    })
    snapshots.length = Math.min(snapshots.length, state.captureMax)
    captured.delete(key)
    captured.set(key, snapshots)
    while (captured.size > MAX_TRACKED_SESSIONS) {
      const oldest = captured.keys().next().value
      if (oldest === key) break
      captured.delete(oldest)
    }

    // Register the tool schemas this request actually sent, so the Tools tab
    // lists every tool description without requiring an override first.
    try {
      const scope = scopeOf(key)
      const overrides = current().toolDescriptionOverrides
      for (const tool of options.tools ?? []) {
        if (typeof tool?.name !== 'string') continue
        const overriddenNow = tool.name in overrides
        const existing = scope.tools.get(tool.name)
        if (existing === undefined) {
          scope.tools.set(tool.name, { defaultDescription: overriddenNow ? undefined : tool.description })
        } else if (!overriddenNow && typeof tool.description === 'string') {
          existing.defaultDescription = tool.description
        }
      }
    } catch (error) {
      note(`tool registration failed: ${String(error?.message ?? error)}`)
    }
  }

  /** Purposes already reported as frozen, to keep the diagnostics short. */
  const frozenNoted = new Set()

  /**
   * Rewrite the instruction text of an auxiliary (scenario) request in place.
   * Compaction builds a mutable options object, so its trailing user message is
   * replaceable; a package that deep-freezes its options stays view-only.
   */
  const patchScenario = (options) => {
    const purpose = options.purpose ?? 'conversation'
    if (purpose === 'conversation') return
    const overrides = current().scenarioPromptOverrides
    const systemText = overrides[`${purpose}:system`]
    const userText = overrides[`${purpose}:user`]
    if (systemText === undefined && userText === undefined) return
    if (systemText !== undefined && typeof options.system === 'string') {
      try {
        options.system = systemText
      } catch {
        if (!frozenNoted.has(`${purpose}:system`)) {
          frozenNoted.add(`${purpose}:system`)
          note(`scenario ${purpose}:system is frozen by its package; override ignored`)
        }
      }
    }
    try {
      const messages = [...options.messages]
      if (systemText !== undefined && typeof options.system !== 'string') {
        const index = messages.findIndex(message => message.role === 'system')
        if (index >= 0) messages[index] = { ...messages[index], content: [{ type: 'text', text: systemText }] }
      }
      if (userText !== undefined) {
        let index = -1
        for (let cursor = messages.length - 1; cursor >= 0; cursor -= 1) {
          if (messages[cursor].role === 'user') {
            index = cursor
            break
          }
        }
        if (index >= 0) messages[index] = { ...messages[index], content: [{ type: 'text', text: userText }] }
      }
      options.messages = messages
    } catch (error) {
      if (!frozenNoted.has(`${purpose}:messages`)) {
        frozenNoted.add(`${purpose}:messages`)
        note(`scenario ${purpose}:messages are frozen by its package; override ignored (${String(error?.message ?? error)})`)
      }
    }
  }

  /** Render the joined, interpolated system prompt from one assembly. */
  const renderPromptText = (assembly) => {
    const interpolate = (text) => text.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (match, variable) => {
      const value = assembly.variables[variable]
      // A global (agent-less) assembly has no model/provider value; keep the
      // placeholder visible instead of failing the whole preview.
      return value === undefined ? match : value
    })
    const parts = []
    for (const section of assembly.sections) {
      if (section.text.length === 0) continue
      parts.push(section.interpolate === false ? section.text : interpolate(section.text))
    }
    return parts.join('\n\n')
  }

  /** Resolve one live agent from the registry by session id. */
  const agentById = (sessionId) => {
    if (sessionId === undefined) return undefined
    const agents = ctx.agents
    if (typeof agents?.get === 'function') return agents.get(sessionId)
    return (agents?.list?.() ?? []).find(candidate => String(candidate.session.id) === sessionId)
  }

  /** Scenario instruction targets from captures, overrides, and shipped reference texts. */
  const scenarioTargets = () => {
    const seen = new Map()
    const textOf = (message) => (message?.content ?? [])
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
    const add = (key, purpose, role, defaultText) => {
      if (!seen.has(key)) seen.set(key, { key, purpose, role, defaultText: defaultText ?? '' })
      return seen.get(key)
    }
    for (const snapshots of captured.values()) {
      for (const snapshot of snapshots) {
        if (snapshot.purpose === 'conversation') continue
        const messages = snapshot.messages ?? []
        const lastUser = [...messages].reverse().find(message => message.role === 'user')
        add(`${snapshot.purpose}:user`, snapshot.purpose, 'user', textOf(lastUser))
        const systemMessage = messages.find(message => message.role === 'system')
        add(`${snapshot.purpose}:system`, snapshot.purpose, 'system',
          typeof snapshot.system === 'string' ? snapshot.system : textOf(systemMessage))
      }
    }
    // Seeded static targets so an auxiliary instruction can be read and edited
    // before its scenario ever runs (for example the compaction instruction).
    for (const [key, reference] of Object.entries(REFERENCE_TEXTS)) {
      if (!key.includes(':user') && !key.includes(':system')) continue
      if (seen.has(key)) continue
      const separator = key.lastIndexOf(':')
      add(key, key.slice(0, separator), key.slice(separator + 1), '')
    }
    const overrides = current().scenarioPromptOverrides
    for (const key of Object.keys(overrides)) {
      if (!seen.has(key)) {
        const separator = key.lastIndexOf(':')
        add(key, key.slice(0, separator), key.slice(separator + 1), '')
      }
    }
    return [...seen.values()].map(target => ({
      ...target,
      override: overrides[target.key] ?? null,
      referenceText: REFERENCE_TEXTS[target.key]?.text ?? null,
      referenceSource: REFERENCE_TEXTS[target.key]?.source ?? null,
    }))
  }

  /** First observed entry for a name across scopes, used by the synthetic overrides scope. */
  const observedEntry = (field, entryName) => {
    for (const scope of observed.values()) {
      const entry = scope[field].get(entryName)
      if (entry !== undefined) return entry
    }
    return undefined
  }

  /**
   * Stable "overrides only" scope: every edit in the active profile stays
   * reachable even when its entry is not assembled in any scope anymore
   * (changed preset, disabled feature, renamed entry after an upgrade).
   */
  const overrideScopeRows = () => {
    const overrides = current()
    const rows = {
      sections: Object.entries(overrides.sectionOverrides).map(([entryName, text]) => {
        const seen = observedEntry('sections', entryName)
        return {
          name: entryName,
          defaultText: seen?.defaultText ?? '',
          override: text,
          interpolate: seen?.interpolate ?? true,
          referenceText: REFERENCE_TEXTS[entryName]?.text ?? null,
          referenceSource: REFERENCE_TEXTS[entryName]?.source ?? null,
          observed: seen !== undefined,
        }
      }),
      contexts: Object.entries(overrides.contextOverrides).map(([entryName, text]) => {
        const seen = observedEntry('contexts', entryName)
        return {
          name: entryName,
          defaultText: seen?.defaultText ?? '',
          override: text,
          interpolate: seen?.interpolate ?? true,
          referenceText: REFERENCE_TEXTS[entryName]?.text ?? null,
          referenceSource: REFERENCE_TEXTS[entryName]?.source ?? null,
          observed: seen !== undefined,
        }
      }),
      variables: Object.entries(overrides.variableOverrides).map(([entryName, text]) => {
        const seen = observedEntry('variables', entryName)
        return { name: entryName, defaultText: seen ?? '', override: text, observed: seen !== undefined }
      }),
      tools: Object.entries(overrides.toolDescriptionOverrides).map(([entryName, text]) => {
        const seen = observedEntry('tools', entryName)
        return { name: entryName, defaultText: seen?.defaultDescription ?? '', override: text, observed: seen !== undefined }
      }),
    }
    const total = rows.sections.length + rows.contexts.length + rows.variables.length + rows.tools.length
    return total === 0 ? [] : [{ key: 'overrides', synthetic: true, ...rows }]
  }

  const inspect = () => {
    const overrides = current()
    return {
      enabled: state.enabled,
      toolEnabled: state.toolEnabled,
      captureMax: state.captureMax,
      activeProfile: state.activeProfile,
      profiles: Object.keys(state.profiles).map(profileName => ({
        name: profileName,
        active: profileName === state.activeProfile,
        sectionCount: Object.keys(state.profiles[profileName].sectionOverrides).length,
        contextCount: Object.keys(state.profiles[profileName].contextOverrides).length,
        variableCount: Object.keys(state.profiles[profileName].variableOverrides).length,
        toolCount: Object.keys(state.profiles[profileName].toolDescriptionOverrides).length,
        scenarioCount: Object.keys(state.profiles[profileName].scenarioPromptOverrides).length,
      })),
      stateFile: STATE_FILE,
      referenceVersion: REFERENCE_VERSION,
      scenarioTargets: scenarioTargets(),
      scopes: [...[...observed].map(([key, scope]) => ({
        key,
        sections: [...scope.sections].map(([entryName, entry]) => ({
          name: entryName,
          defaultText: entry.defaultText,
          override: overrides.sectionOverrides[entryName] ?? null,
          interpolate: entry.interpolate,
          referenceText: REFERENCE_TEXTS[entryName]?.text ?? null,
          referenceSource: REFERENCE_TEXTS[entryName]?.source ?? null,
        })),
        contexts: [...scope.contexts].map(([entryName, entry]) => ({
          name: entryName,
          defaultText: entry.defaultText,
          override: overrides.contextOverrides[entryName] ?? null,
          interpolate: entry.interpolate,
          referenceText: REFERENCE_TEXTS[entryName]?.text ?? null,
          referenceSource: REFERENCE_TEXTS[entryName]?.source ?? null,
        })),
        variables: [...scope.variables].map(([entryName, value]) => ({
          name: entryName,
          defaultText: value,
          override: overrides.variableOverrides[entryName] ?? null,
        })),
        tools: [...scope.tools].map(([entryName, entry]) => ({
          name: entryName,
          defaultText: entry.defaultDescription,
          override: overrides.toolDescriptionOverrides[entryName] ?? null,
          observed: entry.defaultDescription !== undefined,
        })),
      })), ...overrideScopeRows()],
      diagnostics: [...diagnostics],
    }
  }

  const preview = async (request = {}) => {
    const agent = agentById(request.sessionId)
    const assembly = await ctx.systemPrompt.assemble(agent === undefined ? {} : { agent, scope: agent })
    return {
      sections: assembly.sections,
      contexts: assembly.contexts,
      variables: assembly.variables,
      toolNames: (assembly.tools ?? []).map(tool => tool.name),
      systemPrompt: renderPromptText(assembly),
    }
  }

  const setOverride = (request) => {
    const field = KIND_FIELDS[request.kind]
    if (field === undefined) throw new Error('prompt_lab: unknown override kind')
    if (typeof request.name !== 'string' || request.name.length === 0) throw new Error('prompt_lab: name is required')
    const profile = cloneProfile(current())
    profile[field][request.name] = String(request.text ?? '')
    state = { ...state, profiles: { ...state.profiles, [state.activeProfile]: profile } }
    persist()
    return { ok: true, profile: state.activeProfile, kind: request.kind, name: request.name }
  }

  const clearOverride = (request) => {
    const field = KIND_FIELDS[request.kind]
    if (field === undefined) throw new Error('prompt_lab: unknown override kind')
    const profile = cloneProfile(current())
    delete profile[field][request.name]
    state = { ...state, profiles: { ...state.profiles, [state.activeProfile]: profile } }
    persist()
    return { ok: true, profile: state.activeProfile, kind: request.kind, name: request.name }
  }

  const setConfig = (request) => {
    if (request.field === 'enabled') {
      state = { ...state, enabled: !(request.value === false || request.value === 'false') }
    } else if (request.field === 'toolEnabled') {
      state = { ...state, toolEnabled: !(request.value === false || request.value === 'false') }
      syncTool()
    } else if (request.field === 'captureMax') {
      const parsed = Number(request.value)
      if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('prompt_lab: captureMax must be a positive integer')
      state = { ...state, captureMax: parsed }
    } else if (request.field === 'contextOrder') {
      const order = Number(request.value)
      if (typeof request.name !== 'string' || !Number.isFinite(order)) throw new Error('prompt_lab: contextOrder needs name and finite value')
      state = { ...state, contextOrders: { ...state.contextOrders, [request.name]: order } }
    } else {
      throw new Error(`prompt_lab: unknown field ${String(request.field)}`)
    }
    persist()
    return { ok: true }
  }

  /** Create one named profile; `copyFrom` seeds it from an existing profile or the active one. */
  const createProfile = (request) => {
    const profileName = typeof request.name === 'string' ? request.name.trim() : ''
    if (profileName.length === 0) throw new Error('prompt_lab: profile name is required')
    if (profileName in state.profiles) throw new Error(`prompt_lab: profile ${profileName} already exists`)
    const source = typeof request.copyFrom === 'string' && request.copyFrom in state.profiles
      ? state.profiles[request.copyFrom]
      : current()
    state = { ...state, profiles: { ...state.profiles, [profileName]: cloneProfile(source) } }
    persist()
    return { ok: true, profile: profileName }
  }

  /** Delete one named profile; the default profile and the active profile are protected. */
  const deleteProfile = (request) => {
    const profileName = typeof request.name === 'string' ? request.name : ''
    if (!(profileName in state.profiles)) throw new Error(`prompt_lab: unknown profile ${profileName}`)
    if (profileName === 'default') throw new Error('prompt_lab: the default profile cannot be deleted')
    if (profileName === state.activeProfile) throw new Error('prompt_lab: activate another profile before deleting this one')
    const profiles = { ...state.profiles }
    delete profiles[profileName]
    state = { ...state, profiles }
    persist()
    return { ok: true, profile: profileName }
  }

  /** Activate one existing profile for every session. */
  const activateProfile = (request) => {
    const profileName = typeof request.name === 'string' ? request.name : ''
    if (!(profileName in state.profiles)) throw new Error(`prompt_lab: unknown profile ${profileName}`)
    state = { ...state, activeProfile: profileName }
    persist()
    return { ok: true, profile: profileName }
  }

  /** Serialize one profile as a portable JSON envelope (all four override maps). */
  const exportProfile = (request = {}) => {
    const profileName = typeof request.name === 'string' && request.name in state.profiles
      ? request.name
      : state.activeProfile
    return {
      format: 'prompt-lab-profile@1',
      exportedAt: new Date().toISOString(),
      referenceVersion: REFERENCE_VERSION,
      profileName,
      profile: { ...state.profiles[profileName] },
    }
  }

  /**
   * Create a profile from one exported envelope, a bare profile object, or a
   * profile map. The imported name is made unique; nothing is overwritten.
   */
  const importProfile = (request = {}) => {
    let parsed = request.data
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed)
      } catch {
        throw new Error('prompt_lab: import data is not valid JSON')
      }
    }
    const source = isRecord(parsed) ? parsed : {}
    const raw = isRecord(source.profile)
      ? source.profile
      : isRecord(source.profiles)
        ? Object.values(source.profiles)[0]
        : source
    const profile = normalizeProfile(raw)
    const baseName = (typeof request.name === 'string' && request.name.trim().length > 0
      ? request.name.trim()
      : '')
      || (typeof source.profileName === 'string' && source.profileName.trim().length > 0 ? source.profileName.trim() : '')
      || (isRecord(raw) && typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : '')
      || 'imported'
    let profileName = baseName
    let suffix = 2
    while (profileName in state.profiles) {
      profileName = `${baseName}-${suffix}`
      suffix += 1
    }
    state = { ...state, profiles: { ...state.profiles, [profileName]: profile } }
    persist()
    return {
      ok: true,
      profile: profileName,
      counts: {
        sections: Object.keys(profile.sectionOverrides).length,
        contexts: Object.keys(profile.contextOverrides).length,
        variables: Object.keys(profile.variableOverrides).length,
        tools: Object.keys(profile.toolDescriptionOverrides).length,
        scenarios: Object.keys(profile.scenarioPromptOverrides).length,
      },
    }
  }

  const listRequests = () => [...captured.values()].flat()
    .map(snapshot => ({
      id: snapshot.id,
      at: snapshot.at,
      sessionId: snapshot.sessionId,
      profile: snapshot.profile,
      purpose: snapshot.purpose,
      provider: snapshot.provider,
      model: snapshot.model,
      messageCount: snapshot.messages.length,
      toolNames: (snapshot.tools ?? []).map(tool => tool.name),
    }))
    .sort((left, right) => (left.at < right.at ? 1 : -1))

  const readRequest = (request) => {
    for (const snapshots of captured.values()) {
      const found = snapshots.find(snapshot => snapshot.id === request.id)
      if (found !== undefined) return found
    }
    throw new Error(`prompt_lab: no captured request ${String(request.id)}`)
  }

  const clearRequests = (request = {}) => {
    if (request.sessionId === undefined) captured.clear()
    else captured.delete(request.sessionId)
    return { ok: true }
  }

  ctx.on('system-prompt/assemble', (assembly, context, next) => {
    try {
      transform(assembly, context)
    } catch (error) {
      note(`assemble rewrite failed: ${String(error?.message ?? error)}`)
    }
    return next()
  })

  ctx.on('llm/stream', (options, next) => {
    try {
      patchScenario(options)
      remember(options)
    } catch (error) {
      note(`request capture failed: ${String(error?.message ?? error)}`)
    }
    return next()
  })

  ctx.on('agent/disposed', ({ agent }) => {
    const scoped = shadows.get(String(agent.session.id))
    if (scoped === undefined) return
    for (const holder of scoped.values()) (holder.dispose ?? holder)()
    shadows.delete(String(agent.session.id))
  })

  ctx.effect(() => () => {
    for (const scoped of shadows.values()) for (const holder of scoped.values()) (holder.dispose ?? holder)()
    shadows.clear()
  }, 'prompt-lab:shadow-ownership')

  /** One dispatcher behind both the HTTP route and the agent tool. */
  const dispatch = async (request) => {
    const action = request?.action
    switch (action) {
      case 'inspect': return inspect()
      case 'set': return setOverride(request)
      case 'clear': return clearOverride(request)
      case 'preview': return preview({ sessionId: request.sessionId })
      case 'requests': return { requests: listRequests() }
      case 'read': {
        const snapshot = readRequest(request)
        const tail = Number.isSafeInteger(request.tail) && request.tail > 0 ? request.tail : undefined
        if (tail === undefined || tail >= snapshot.messages.length) return snapshot
        return { ...snapshot, messageCount: snapshot.messages.length, truncated: true, messages: snapshot.messages.slice(-tail) }
      }
      case 'clearRequests': return clearRequests({ sessionId: request.sessionId })
      case 'setConfig': return setConfig(request)
      case 'createProfile': return createProfile(request)
      case 'deleteProfile': return deleteProfile(request)
      case 'activateProfile': return activateProfile(request)
      case 'exportProfile': return exportProfile(request)
      case 'importProfile': return importProfile(request)
      default: throw new Error(`prompt_lab: unknown action ${String(action)}`)
    }
  }

  // ---- same-origin resource API for the Settings page --------------------
  // The Desktop page reaches the Host through `webServer` resource reads
  // (GET/HEAD only), so every action travels as a query parameter and
  // mutations carry a per-process token that only the page can read back.
  // `ctx.inject` waits for the service: on a cold boot this plugin can
  // activate before the web carrier has provided `webServer`, and a missing
  // route would leave the page with an empty 404 response.
  {
    const token = randomBytes(16).toString('hex')
    /** Pending chunked-write buffers: id -> { text, at }. TTL and size capped. */
    const pendingWrites = new Map()
    const pendingLimit = 1_048_576
    /** Drop expired or excess chunked-write buffers (a page can close mid-upload). */
    const sweepPendingWrites = () => {
      const now = Date.now()
      for (const [id, entry] of pendingWrites) {
        if (now - entry.at > PENDING_WRITE_TTL_MS) pendingWrites.delete(id)
      }
      while (pendingWrites.size > MAX_PENDING_WRITES) {
        pendingWrites.delete(pendingWrites.keys().next().value)
      }
    }
    const respond = (status, payload) => new Response(JSON.stringify(jsonSafe(payload)), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
    const decodeBase64 = (value) => Buffer.from(value, 'base64').toString('utf8')
    const resource = async (request) => {
      try {
        if (request.method !== 'GET' && request.method !== 'HEAD') return respond(405, { ok: false, error: 'method not allowed' })
        const url = new URL(request.url)
        if (url.pathname !== API_PATH) return respond(404, { ok: false, error: 'not found' })
        const params = url.searchParams
        const action = params.get('action') ?? 'inspect'
        const provided = params.get('token')
        const mutating = action === 'set' || action === 'clear' || action === 'setConfig'
          || action === 'createProfile' || action === 'deleteProfile' || action === 'activateProfile'
          || action === 'importProfile'
          || action === 'clearRequests' || action === 'beginWrite' || action === 'appendWrite' || action === 'commitWrite'
        if (mutating && provided !== token) return respond(403, { ok: false, error: 'missing or invalid token' })
        switch (action) {
          case 'beginWrite': {
            sweepPendingWrites()
            const id = randomBytes(8).toString('hex')
            pendingWrites.set(id, { text: '', at: Date.now() })
            return respond(200, { ok: true, data: { id } })
          }
          case 'appendWrite': {
            sweepPendingWrites()
            const id = params.get('id') ?? ''
            const entry = pendingWrites.get(id)
            if (entry === undefined) return respond(400, { ok: false, error: 'unknown write id' })
            const next = entry.text + decodeBase64(params.get('data') ?? '')
            if (next.length > pendingLimit) return respond(400, { ok: false, error: 'write too large' })
            entry.text = next
            entry.at = Date.now()
            return respond(200, { ok: true, data: { size: next.length } })
          }
          case 'commitWrite': {
            sweepPendingWrites()
            const id = params.get('id') ?? ''
            const entry = pendingWrites.get(id)
            if (entry === undefined) return respond(400, { ok: false, error: 'unknown write id' })
            const text = entry.text
            pendingWrites.delete(id)
            const target = params.get('kind') ?? 'set'
            const result = target === 'importProfile'
              ? await dispatch({ action: 'importProfile', name: params.get('name') ?? undefined, data: text })
              : await dispatch({
                action: 'set',
                kind: target,
                name: params.get('name') ?? undefined,
                text,
              })
            return respond(200, { ok: true, data: result })
          }
          case 'inspect':
            return respond(200, { ok: true, data: { ...inspect(), token } })
          case 'preview': {
            const sessionId = params.get('sessionId') ?? undefined
            return respond(200, { ok: true, data: await dispatch({ action: 'preview', sessionId }) })
          }
          case 'requests':
            return respond(200, { ok: true, data: { requests: listRequests() } })
          case 'read': {
            const id = params.get('id') ?? ''
            const tail = params.get('tail') === null ? undefined : Number(params.get('tail'))
            return respond(200, { ok: true, data: await dispatch({ action: 'read', id, tail }) })
          }
          default: {
            const body = { action }
            for (const [key, value] of params) {
              if (key === 'action' || key === 'token') continue
              body[key] = value
            }
            return respond(200, { ok: true, data: await dispatch(body) })
          }
        }
      } catch (error) {
        return respond(400, { ok: false, error: String(error?.message ?? error) })
      }
    }
    ctx.inject(['webServer'], (inner) => {
      inner.effect(() => inner.webServer.register({ kind: 'prefix', path: API_PATH, resource }), 'prompt-lab:http-route')
    })
  }

  // ---- agent tool ---------------------------------------------------------
  // Optional by design: outside prompt engineering the user can hide this tool
  // from the model while the Settings page keeps working over the HTTP route.
  const toolDefinition = () => ({
    name: 'prompt_lab',
    description: 'Inspect and edit the system prompt entries injected for this profile, switch between saved prompt profiles, and read exact model requests captured before they reach the LLM layer. Edits go to the active profile and take effect from the next model step of any session. Actions: "list" shows sections, runtime contexts, variables and tool descriptions with shipped defaults and current overrides plus available profiles; "set" and "clear" change one entry in the active profile; "profiles" lists, "createProfile", "deleteProfile" and "activateProfile" manage saved sets; "preview" renders the effective system prompt for one session; "requests" and "read" expose captured final requests. A Prompt Lab page under Settings provides the same controls.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'set', 'clear', 'preview', 'requests', 'read', 'profiles', 'createProfile', 'deleteProfile', 'activateProfile'],
        },
        kind: { type: 'string', enum: ['section', 'context', 'variable', 'tool', 'scenario'], description: 'Entry kind for set and clear; "scenario" addresses an auxiliary request instruction key such as "compaction:user".' },
        name: { type: 'string', description: 'Entry name (for set/clear) or profile name (for profile actions).' },
        text: { type: 'string', description: 'Replacement text for set; empty removes the entry at render time.' },
        copyFrom: { type: 'string', description: 'For createProfile: seed the new profile from this name (defaults to the active profile).' },
        sessionId: { type: 'string', description: 'Session whose agent scope to preview; defaults to the calling session.' },
        id: { type: 'string', description: 'Captured request id for read.' },
        tail: { type: 'number', description: 'For read: keep only this many most recent messages.' },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      try {
        const mapped = { ...args }
        if (args.action === 'list') mapped.action = 'inspect'
        else if (args.action === 'profiles') mapped.action = 'inspect'
        else if (args.action === 'preview') mapped.sessionId ??= exec.agent?.session.id
        return jsonSafe(await dispatch(jsonSafe(mapped)))
      } catch (error) {
        return { ok: false, error: String(error?.message ?? error) }
      }
    },
  })

  let toolDisposer
  syncTool = () => {
    try {
      if (state.toolEnabled && toolDisposer === undefined) {
        toolDisposer = ctx.tools.register(toolDefinition())
      } else if (!state.toolEnabled && toolDisposer !== undefined) {
        toolDisposer()
        toolDisposer = undefined
      }
    } catch (error) {
      note(`tool registration failed: ${String(error?.message ?? error)}`)
    }
  }
  ctx.effect(() => () => {
    if (toolDisposer !== undefined) {
      toolDisposer()
      toolDisposer = undefined
    }
  }, 'prompt-lab:tool-ownership')
  syncTool()
}
