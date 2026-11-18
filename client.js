/**
 * Prompt Lab browser half: a Settings page that edits every injected prompt
 * entry, manages saved prompt profiles, and shows the exact requests
 * sent to the model — including scenario requests such as compaction and
 * session titles. Talks to the Host half over the same-origin resource API.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-prompt-lab',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = '@local/dsh-prompt-lab'
    const API = '/prompt-lab/api'
    const MUTATING = new Set(['set', 'clear', 'setConfig', 'createProfile', 'deleteProfile',
      'activateProfile', 'importProfile', 'clearRequests', 'beginWrite', 'appendWrite', 'commitWrite'])
    let sessionToken = null

    const EN = {
      title: 'Prompt Lab',
      intro: 'Every entry the system prompt assembly injects, editable per profile; captured requests show exactly what the model receives.',
      entries: 'Entries',
      requests: 'Requests',
      assembly: 'Live assembly',
      scenarios: 'Scenarios',
      sections: 'Sections',
      contexts: 'Contexts',
      variables: 'Variables',
      tools: 'Tools',
      scope: 'Scope',
      global: 'Global layer',
      scopeOverrides: 'Overrides only',
      scopeMore: 'more sessions hidden',
      unobserved: 'not observed',
      enabled: 'Apply overrides & capture',
      enabledHint: 'When off, overrides are not applied and requests are not captured; editing here still saves to the profile.',
      toolEnabled: 'Offer prompt_lab to the AI',
      toolEnabledHint: 'When off, the assistant cannot call prompt_lab; this page still edits overrides through the same-origin API.',
      captureMax: 'Kept requests',
      refresh: 'Refresh',
      save: 'Save override',
      revert: 'Revert to default',
      defaultText: 'Default text',
      referenceText: 'Static reference text',
      referenceMissing: 'This entry is inactive and has no static reference text; its text is generated from runtime state.',
      showPosition: 'Show position in the full prompt',
      positionTitle: 'Position in the full prompt',
      positionHint: 'Entries in assembly order. The highlighted one is the current entry; its reference text is shown when inactive.',
      close: 'Close',
      override: 'Override',
      overridden: 'overridden',
      notOverridden: 'default',
      placeholder: 'Replacement text. Used verbatim; empty removes the entry at render time. {{model}} still interpolates.',
      empty: 'No entries observed yet. They appear after the next model step of a session.',
      toolsEmpty: 'No tool schemas yet: they are registered from requests actually sent. Send one message in this session and the Tools tab lists every tool with its description.',
      toolDefaultHint: 'This tool has no captured description yet (it was not part of a sent request). Send one message, or keep the override as-is.',
      requestInfo: 'Request',
      raw: 'Raw JSON',
      preview: 'Assemble now',
      previewHint: 'Renders the current assembly for the selected scope without sending a request.',
      model: 'Model',
      at: 'Sent at',
      purpose: 'Purpose',
      messages: 'Messages',
      toolSchemas: 'Tool schemas',
      busy: 'Working...',
      failed: 'Failed:',
      saved: 'Saved. Live from the next step.',
      clearRequests: 'Clear captured requests',
      noRequests: 'No requests captured yet.',
      hint: 'Tip: edit the identity/role, sandbox or approval policy, or any tool guidance here, then switch profiles to A/B the effect.',
      systemPrompt: 'Rendered system prompt',
      profiles: 'Profiles',
      activeProfile: 'Active profile',
      newProfile: 'New profile name',
      createProfile: 'Save as new profile',
      deleteProfile: 'Delete',
      copyProfile: 'Copy JSON',
      copied: 'Copied to clipboard.',
      exportProfile: 'Export profile',
      importProfile: 'Import profile',
      exported: 'Profile JSON downloaded.',
      imported: 'Profile imported and switched to.',
      profileHint: 'The active profile applies to every session. Create a profile per role/craft, then switch to compare.',
      profileEmpty: 'no overrides',
      noScope: 'No live scope observed yet.',
      crashed: 'The Prompt Lab page crashed:',
      scenarioEntries: 'Scenario-only entries (inactive in this scope)',
      scenarioRequests: 'Scenario requests',
      scenarioOverrides: 'Scenario prompt overrides',
      scenarioOverrideHint: 'Edit an auxiliary call\'s instruction text. Locked packages (frozen requests) keep their text; compaction requests are mutable once captured.',
      scenarioHint: 'Compaction and session-title prompts are built by their own packages, not registered here; they always replay this session\'s system prompt, so profile edits apply. Their instruction text is visible below once captured.',
      noScenarioEntries: 'No inactive entries: every observed entry is active in this scope.',
      noScenarioRequests: 'No scenario requests captured yet. Run /compact or wait for a title call; raise "Kept requests" to retain more.',
      filterAll: 'All purposes',
      purposeConversation: 'conversation',
      familyPlan: 'Plan mode',
      familyTeam: 'Agent teams',
      familySubagent: 'Subagents',
      familyMcp: 'MCP resources',
      familyUi: 'UI guidance',
      familyTool: 'Tool',
      familyOther: 'Other',
      inactiveNow: 'inactive now',
      activeNow: 'active',
    }
    const ZH = {
      title: '提示词实验室',
      intro: '系统提示词组装注入的每个条目都可按档编辑；捕获的请求展示模型实际收到的完整内容。',
      entries: '条目',
      requests: '请求',
      assembly: '实时组装',
      scenarios: '场景',
      sections: '段落',
      contexts: '上下文',
      variables: '变量',
      tools: '工具',
      scope: '作用域',
      global: '全局层',
      scopeOverrides: '仅覆盖',
      scopeMore: '个会话未显示',
      unobserved: '未观测',
      enabled: '应用覆盖并捕获',
      enabledHint: '关闭后不应用覆盖、不捕获请求；页面编辑仍会保存到档位。',
      toolEnabled: '向 AI 提供 prompt_lab 工具',
      toolEnabledHint: '关闭后 AI 无法调用 prompt_lab；页面仍可通过同源 API 编辑覆盖。',
      captureMax: '保留请求数',
      refresh: '刷新',
      save: '保存覆盖',
      revert: '恢复默认',
      defaultText: '默认文本',
      referenceText: '静态参考值',
      referenceMissing: '该条目未激活，且没有静态参考值（文本由运行时状态生成）。',
      showPosition: '查看在完整提示词中的位置',
      positionTitle: '在完整提示词中的位置',
      positionHint: '按组装顺序列出条目；高亮的是当前条目，未激活时显示其静态参考值。',
      close: '关闭',
      override: '覆盖文本',
      overridden: '已覆盖',
      notOverridden: '默认',
      placeholder: '替换文本，按原样使用；空文本会在渲染时移除该条目。{{model}} 仍会解析。',
      empty: '尚未观察到条目。会话下一次模型步骤后出现。',
      toolsEmpty: '尚无工具 schema：工具来自真正发出的请求。在本会话发送一条消息后，「工具」页会列出全部工具及其描述。',
      toolDefaultHint: '该工具尚未捕获到描述（未出现在任何已发出的请求中）。发送一条消息后再看，或保留当前覆盖。',
      requestInfo: '请求信息',
      raw: '原始 JSON',
      preview: '立即组装',
      previewHint: '为所选作用域重新组装并渲染当前提示词，不发送请求。',
      model: '模型',
      at: '发送时间',
      purpose: '用途',
      messages: '消息',
      toolSchemas: '工具 schema',
      busy: '处理中...',
      failed: '失败：',
      saved: '已保存，下一步生效。',
      clearRequests: '清空已捕获请求',
      noRequests: '尚未捕获请求。',
      hint: '提示：可编辑身份/角色设定、沙箱/审批策略或任意工具指引，然后切换档位对比效果。',
      systemPrompt: '渲染后的系统提示词',
      profiles: '档位',
      activeProfile: '当前档位',
      newProfile: '新档位名称',
      createProfile: '保存为新档位',
      deleteProfile: '删除',
      copyProfile: '复制 JSON',
      copied: '已复制到剪贴板。',
      exportProfile: '导出档位',
      importProfile: '导入档位',
      exported: '已下载档位 JSON。',
      imported: '已导入并切换到该档位。',
      profileHint: '当前档位对整个应用生效。可按角色/风格建多个档位，切换对比。',
      profileEmpty: '无覆盖',
      noScope: '尚未观察到活动作用域。',
      crashed: 'Prompt Lab 页面出错：',
      scenarioEntries: '场景专属条目（当前作用域未激活）',
      scenarioRequests: '场景请求',
      scenarioOverrides: '场景提示词覆盖',
      scenarioOverrideHint: '编辑辅助调用的指令文本。被包冻结的请求保持原文；压缩请求捕获后可变。',
      scenarioHint: '压缩与会话标题提示词由各自包内部构造、不经过这里注册；但它们都会复用本会话的系统提示词，因此档位修改对它们生效。指令正文在捕获后可在下方查看。',
      noScenarioEntries: '没有未激活条目：当前作用域内所有条目均已激活。',
      noScenarioRequests: '尚未捕获场景请求。可运行 /compact 或等标题调用发生；调高「保留请求数」可保留更多。',
      filterAll: '全部用途',
      purposeConversation: 'conversation',
      familyPlan: '计划模式',
      familyTeam: '智能体团队',
      familySubagent: '子代理',
      familyMcp: 'MCP 资源',
      familyUi: '界面指引',
      familyTool: '工具',
      familyOther: '其他',
      inactiveNow: '未激活',
      activeNow: '已激活',
    }
    const DICT = { en: EN, zh: ZH }
    function lang() {
      const tags = globalThis.navigator?.languages ?? []
      return tags.some(tag => /^zh\b/i.test(tag)) ? 'zh' : 'en'
    }
    const L = lang()
    const t = key => (DICT[L][key] ?? EN[key] ?? key)

    const CSS = [
      '.pl-root{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;color:var(--dsw-alias-label-primary)}',
      '.pl-head h2{margin:0 0 4px;font-size:16px;font-weight:600}',
      '.pl-head p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}',
      '.pl-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
      '.pl-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.pl-tab{padding:6px 10px;font-size:13px;background:none;border:none;border-bottom:2px solid transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.pl-tab[data-active="true"]{color:var(--dsw-alias-brand-primary);border-bottom-color:var(--dsw-alias-brand-primary)}',
      '.pl-body{display:grid;grid-template-columns:310px minmax(0,1fr);gap:10px;flex:1;min-height:0}',
      '.pl-panel{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;min-height:0;overflow:auto}',
      '.pl-groups{display:flex;flex-wrap:wrap;gap:4px;padding:8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.pl-group{padding:3px 8px;font-size:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.pl-group[data-active="true"]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.pl-row{display:flex;flex-direction:column;gap:2px;padding:7px 10px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.pl-row[data-active="true"]{background:var(--dsw-alias-bg-layer-2)}',
      '.pl-row code{font-size:12px;word-break:break-all}',
      '.pl-row small{color:var(--dsw-alias-label-secondary)}',
      '.pl-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;background:var(--dsw-alias-state-idle-primary)}',
      '.pl-dot[data-on="true"]{background:var(--dsw-alias-state-success-primary)}',
      '.pl-detail{display:flex;flex-direction:column;gap:8px;padding:12px;min-height:0}',
      '.pl-detail h3{margin:0;font-size:13px}',
      '.pl-detail label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-secondary)}',
      '.pl-pre{margin:0;padding:8px;font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;max-height:240px;overflow:auto}',
      '.pl-textarea{width:100%;min-height:150px;box-sizing:border-box;padding:8px;font:11px/1.45 ui-monospace,monospace;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;resize:vertical}',
      '.pl-btn{padding:5px 10px;font-size:12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.pl-btn.primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.pl-btn:disabled{opacity:.5;cursor:default}',
      '.pl-input{width:110px;padding:4px 6px;font-size:12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.pl-chip{display:inline-block;margin:0 6px 6px 0;padding:2px 8px;font-size:11px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}',
      '.pl-error{color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:pre-wrap;padding:8px}',
      '.pl-msg{border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:6px 8px;margin-bottom:6px;background:var(--dsw-alias-bg-base)}',
      '.pl-msg header{display:flex;gap:8px;align-items:center;font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:4px}',
      '.pl-msg pre{margin:0;font-size:11px;line-height:1.4;white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto}',
      '.pl-empty{padding:24px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.pl-hint{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.5}',
      '.pl-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px}',
      '.pl-sec{padding:8px 0 0;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);padding-left:10px}',
      '.pl-overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.45)}',
      '.pl-overlay-panel{width:min(780px,92vw);max-height:82vh;overflow:auto;background:var(--dsw-alias-bg-overlay);border-radius:10px;padding:12px}',
      '.pl-overlay-head{display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:0;background:var(--dsw-alias-bg-overlay);padding:4px 0;z-index:1}',
      '.pl-overlay-head h3{margin:0;font-size:13px}',
      '.pl-msg[data-target="true"]{border-color:var(--dsw-alias-brand-primary)}',
    ].join('\n')

    function base64(text) {
      const bytes = new TextEncoder().encode(text)
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return btoa(binary)
    }

    async function rawGet(action, extra) {
      const params = new URLSearchParams({ action })
      for (const [key, value] of Object.entries(extra ?? {})) {
        if (value !== undefined && value !== null) params.set(key, String(value))
      }
      if (sessionToken !== null && MUTATING.has(action)) params.set('token', sessionToken)
      const response = await fetch(`${API}?${params.toString()}`, { headers: { accept: 'application/json' } })
      const text = await response.text()
      if (text.length === 0) throw new Error(`HTTP ${response.status}: empty response from ${API}`)
      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`)
      }
      return { status: response.status, payload }
    }

    async function get(action, extra, allowRetry = true) {
      const { status, payload } = await rawGet(action, extra)
      if (!payload.ok) {
        if (status === 403 && allowRetry) {
          const refreshed = await rawGet('inspect', {})
          if (refreshed.payload.ok) {
            sessionToken = refreshed.payload.data?.token ?? sessionToken
            return get(action, extra, false)
          }
        }
        throw new Error(payload.error ?? `HTTP ${status}`)
      }
      return payload.data
    }

    function insertStyles() {
      if (typeof styles !== 'undefined' && styles !== null && typeof styles.insert === 'function') {
        return styles.insert(CSS)
      }
      const element = document.createElement('style')
      element.textContent = CSS
      document.head.append(element)
      return () => element.remove()
    }

    const KIND_TABS = [
      { key: 'section', label: t('sections'), field: 'sections' },
      { key: 'context', label: t('contexts'), field: 'contexts' },
      { key: 'variable', label: t('variables'), field: 'variables' },
      { key: 'tool', label: t('tools'), field: 'tools' },
    ]

    /** Scenario family from an entry name, used to group inactive entries. */
    function familyOf(name) {
      if (name.startsWith('plan:')) return 'plan'
      if (name.startsWith('team:')) return 'team'
      if (name.startsWith('tool:subagent') || name.startsWith('subagent:')) return 'subagent'
      if (name.startsWith('mcp') || name.includes('mcp-')) return 'mcp'
      if (name.startsWith('ui:')) return 'ui'
      if (name.startsWith('tool:')) return 'tool'
      return 'other'
    }
    const FAMILY_LABELS = {
      plan: () => t('familyPlan'),
      team: () => t('familyTeam'),
      subagent: () => t('familySubagent'),
      mcp: () => t('familyMcp'),
      ui: () => t('familyUi'),
      tool: () => t('familyTool'),
      other: () => t('familyOther'),
    }

    /** Readable scope label: fixed names for global/overrides, else the short session id. */
    function scopeLabel(key) {
      if (key === 'global') return t('global')
      if (key === 'overrides') return t('scopeOverrides')
      const short = key.replace(/^session-/, '').slice(0, 8)
      return short.length > 0 ? short : key.slice(0, 8)
    }

    /** Readable profile summary: the profile name plus only the non-zero override counts. */
    function profileChipText(profile) {
      const parts = []
      if (profile.sectionCount > 0) parts.push(t('sections') + ' ' + profile.sectionCount)
      if (profile.contextCount > 0) parts.push(t('contexts') + ' ' + profile.contextCount)
      if (profile.variableCount > 0) parts.push(t('variables') + ' ' + profile.variableCount)
      if (profile.toolCount > 0) parts.push(t('tools') + ' ' + profile.toolCount)
      if ((profile.scenarioCount ?? 0) > 0) parts.push(t('scenarios') + ' ' + profile.scenarioCount)
      return parts.length === 0 ? profile.name + ' · ' + t('profileEmpty') : profile.name + ' · ' + parts.join(' · ')
    }

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      render() {
        if (this.state.error !== null) {
          return h('div', { className: 'pl-root' },
            h('div', { className: 'pl-error' }, t('crashed') + ' ' + String(this.state.error?.message ?? this.state.error)))
        }
        return this.props.children
      }
    }

    function EntryEditor(props) {
      const { entry, kind, draft, setDraft, busy, onSave, onRevert, activeProfile, onPosition } = props
      const has = entry.override !== null && entry.override !== undefined
      return h('div', { className: 'pl-detail' },
        h('h3', null, h('code', null, entry.name), h('span', { className: 'pl-chip', style: { marginLeft: '8px' } }, kind)),
        has ? h('div', null,
          h('label', null, t('override') + ' · ' + activeProfile),
          h('pre', { className: 'pl-pre' }, entry.override)) : null,
        h('label', null, t('defaultText')),
        (entry.defaultText ?? '') === ''
          ? (entry.referenceText
            ? h('div', null,
              h('label', null, t('referenceText') + (entry.referenceSource ? ' · ' + entry.referenceSource : '')),
              h('pre', { className: 'pl-pre' }, entry.referenceText))
            : h('p', { className: 'pl-hint' }, kind === 'tool' ? t('toolDefaultHint') : t('referenceMissing')))
          : h('pre', { className: 'pl-pre' }, entry.defaultText),
        h('label', null, t('override')),
        h('textarea', {
          className: 'pl-textarea', value: draft, placeholder: t('placeholder'),
          onChange: (event) => setDraft(event.target.value),
        }),
        h('div', { className: 'pl-bar' },
          h('button', { className: 'pl-btn primary', disabled: busy, onClick: onSave }, t('save')),
          h('button', { className: 'pl-btn', disabled: busy || !has, onClick: onRevert }, t('revert')),
          onPosition === undefined ? null : h('button', { className: 'pl-btn', disabled: busy, onClick: onPosition }, t('showPosition')),
        ),
        h('p', { className: 'pl-hint' }, t('hint')),
      )
    }

    function RequestBody(props) {
      const { request } = props
      const blocks = (content) => (content ?? []).map((item, index) => {
        if (item.type === 'text' || item.type === 'reasoning') {
          return h('details', { key: index },
            h('summary', null, item.type + ' (' + item.text.length + ' chars)'),
            h('pre', null, item.text),
          )
        }
        if (item.type === 'tool-call') {
          return h('details', { key: index },
            h('summary', null, 'tool-call ' + item.name),
            h('pre', null, JSON.stringify(item, null, 2)),
          )
        }
        return h('details', { key: index }, h('summary', null, item.type), h('pre', null, JSON.stringify(item, null, 2)))
      })
      return h('div', { className: 'pl-detail' },
        h('h3', null, t('requestInfo') + ' ' + request.id),
        h('div', null,
          h('span', { className: 'pl-chip' }, request.provider + ' / ' + request.model),
          h('span', { className: 'pl-chip' }, t('purpose') + ': ' + request.purpose),
          h('span', { className: 'pl-chip' }, t('at') + ': ' + request.at),
          request.profile === undefined ? null : h('span', { className: 'pl-chip' }, 'profile: ' + request.profile),
          request.reasoningEffort === undefined ? null : h('span', { className: 'pl-chip' }, 'effort: ' + request.reasoningEffort),
          request.temperature === undefined ? null : h('span', { className: 'pl-chip' }, 'temp: ' + request.temperature),
          request.maxTokens === undefined ? null : h('span', { className: 'pl-chip' }, 'maxTokens: ' + request.maxTokens),
        ),
        typeof request.system === 'string' && request.system.length > 0
          ? h('div', null,
            h('label', null, 'system'),
            h('pre', { className: 'pl-pre' }, request.system))
          : null,
        h('label', null, t('messages') + ' (' + request.messages.length + ')'),
        request.messages.map((message, index) => h('div', { key: index, className: 'pl-msg' },
          h('header', null,
            h('strong', null, message.role),
            h('span', null, 'source: ' + (message.source?.kind ?? '?') + (message.source?.form === undefined ? '' : ' · ' + message.source.form)),
          ),
          h('div', null, blocks(message.content)),
        )),
        h('label', null, t('toolSchemas') + ' (' + (request.tools ?? []).length + ')'),
        (request.tools ?? []).map((tool, index) => h('details', { key: 'tool-' + index },
          h('summary', null, tool.name),
          h('pre', null, 'description: ' + tool.description + '\n\n' + JSON.stringify(tool.parameters, null, 2)),
        )),
        h('details', null, h('summary', null, t('raw')), h('pre', { className: 'pl-pre' }, JSON.stringify(request, null, 2))),
      )
    }

    function Page() {
      const [data, setData] = React.useState(null)
      const [requests, setRequests] = React.useState([])
      const [tab, setTab] = React.useState('entries')
      const [scopeKey, setScopeKey] = React.useState(null)
      const [kind, setKind] = React.useState('section')
      const [selected, setSelected] = React.useState(null)
      const [draft, setDraft] = React.useState('')
      const [requestId, setRequestId] = React.useState(null)
      const [request, setRequest] = React.useState(null)
      const [assembly, setAssembly] = React.useState(null)
      const [position, setPosition] = React.useState(null)
      const [newProfile, setNewProfile] = React.useState('')
      const [scEntry, setScEntry] = React.useState(null)
      const [scDraft, setScDraft] = React.useState('')
      const [scRequest, setScRequest] = React.useState(null)
      const [scFilter, setScFilter] = React.useState('scenario')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const fileInputRef = React.useRef(null)

      const run = async (work) => {
        setBusy(true)
        setError(null)
        try {
          await work()
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      const refreshToken = async () => {
        const next = await get('inspect', {}, false)
        sessionToken = next.token ?? sessionToken
        return next
      }

      /** Load the entries list and request summaries; shared by refresh and preview. */
      const loadData = async () => {
        const next = await refreshToken()
        const list = await get('requests')
        setData(next)
        setRequests(list.requests)
        const scopes = next.scopes ?? []
        const sessions = scopes.filter(scope => scope.key !== 'global' && scope.key !== 'overrides')
        // Default to the newest session; the scope picker also shows the newest two.
        const preferred = sessions.length > 0 ? sessions[sessions.length - 1].key : (scopes[0]?.key ?? null)
        setScopeKey(currentKey => currentKey !== null && scopes.some(scope => scope.key === currentKey) ? currentKey : preferred)
      }

      const refresh = () => run(loadData)

      React.useEffect(() => { refresh() }, [])

      const scope = data?.scopes?.find(candidate => candidate.key === scopeKey) ?? null
      const field = KIND_TABS.find(item => item.key === kind)?.field ?? 'sections'
      const entries = scope === null ? [] : scope[field] ?? []
      const entry = entries.find(candidate => candidate.name === selected) ?? null
      const hasOverride = (value) => value !== null && value !== undefined
      const activeProfile = data?.activeProfile ?? ''

      const selectEntry = (row) => {
        setSelected(row.name)
        setDraft(row.override ?? '')
      }

      const writeLongText = async (text, entryKind, entryName) => {
        const points = Array.from(text)
        const started = await get('beginWrite')
        const id = started.id
        for (let index = 0; index < points.length; index += 300) {
          await get('appendWrite', { id, data: base64(points.slice(index, index + 300).join('')) })
        }
        return get('commitWrite', { id, kind: entryKind, name: entryName })
      }

      const saveEntry = (entryKind, entryName, text) => {
        if (Array.from(text).length > 600) return writeLongText(text, entryKind, entryName)
        return get('set', { kind: entryKind, name: entryName, text })
      }

      const save = () => run(async () => {
        await saveEntry(kind, selected, draft)
        setNotice(t('saved'))
        await refresh()
      })

      const revert = () => run(async () => {
        await get('clear', { kind, name: selected })
        setDraft('')
        setNotice(t('saved'))
        await refresh()
      })

      const saveScenario = () => run(async () => {
        if (scEntry === null) return
        await saveEntry(scEntry.kind, scEntry.name, scDraft)
        setNotice(t('saved'))
        await refresh()
      })

      const revertScenario = () => run(async () => {
        if (scEntry === null) return
        await get('clear', { kind: scEntry.kind, name: scEntry.name })
        setScDraft('')
        setNotice(t('saved'))
        await refresh()
      })

      const toggleEnabled = () => run(async () => {
        await get('setConfig', { field: 'enabled', value: data.enabled ? 'false' : 'true' })
        await refresh()
      })

      /** Offer or hide the prompt_lab tool for the model (the page keeps working either way). */
      const toggleTool = () => run(async () => {
        await get('setConfig', { field: 'toolEnabled', value: data.toolEnabled ? 'false' : 'true' })
        await refresh()
      })

      const setCaptureMax = (value) => run(async () => {
        const parsed = Math.max(1, Math.trunc(Number(value) || 1))
        await get('setConfig', { field: 'captureMax', value: parsed })
        await refresh()
      })

      const activate = (profile) => run(async () => {
        await get('activateProfile', { name: profile })
        setNotice(t('saved'))
        await refresh()
      })

      const createProfile = () => run(async () => {
        const name = newProfile.trim()
        if (name.length === 0) return
        await get('createProfile', { name })
        setNewProfile('')
        await get('activateProfile', { name })
        await refresh()
      })

      const deleteProfile = (profile) => run(async () => {
        await get('deleteProfile', { name: profile })
        await refresh()
      })

      const copyProfile = () => run(async () => {
        const payload = await get('exportProfile', { name: data.activeProfile })
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
        setNotice(t('copied'))
      })

      /** Download the active profile as a portable JSON file. */
      const exportProfile = () => run(async () => {
        const payload = await get('exportProfile', { name: data.activeProfile })
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `prompt-lab-${payload.profileName}-${new Date().toISOString().slice(0, 10)}.json`
        document.body.append(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        setNotice(t('exported'))
      })

      /** Import one exported profile file and switch to the created profile. */
      const importProfile = (event) => run(async () => {
        const file = event.target.files && event.target.files[0]
        event.target.value = ''
        if (!file) return
        const text = await file.text()
        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new Error('invalid JSON export file')
        }
        const name = (typeof parsed.profileName === 'string' && parsed.profileName.trim().length > 0)
          ? parsed.profileName.trim()
          : file.name.replace(/\.json$/i, '')
        const result = Array.from(text).length > 600
          ? await writeLongText(text, 'importProfile', name)
          : await get('importProfile', { name, data: text })
        await get('activateProfile', { name: result.profile })
        setNotice(t('imported'))
        await refresh()
      })

      const openRequest = (id) => run(async () => {
        setRequestId(id)
        setRequest(await get('read', { id }))
      })

      const openScenarioRequest = (id) => run(async () => {
        setScRequest(await get('read', { id }))
      })

      const clearRequests = () => run(async () => {
        await get('clearRequests', {})
        setRequestId(null)
        setRequest(null)
        setScRequest(null)
        await refresh()
      })

      const assemble = () => run(async () => {
        const result = await get('preview', { sessionId: scopeKey === null || scopeKey === 'global' || scopeKey === 'overrides' ? undefined : scopeKey })
        setAssembly(result)
        // The preview runs a real assembly, so it also records entries for this
        // scope; reload the list so the left panel reflects them immediately.
        await loadData()
      })

      /** Show one entry inside the full assembled prompt, with its reference text at the same slot. */
      const showPosition = (targetKind, targetName, referenceText) => run(async () => {
        const result = await get('preview', { sessionId: scopeKey === null || scopeKey === 'global' || scopeKey === 'overrides' ? undefined : scopeKey })
        setPosition({ kind: targetKind, name: targetName, referenceText, assembly: result })
      })

      // Inactive scenario-only entries, grouped by family.
      const scenarioGroups = (() => {
        if (scope === null) return []
        const groups = new Map()
        for (const kindItem of KIND_TABS) {
          const list = scope[kindItem.field] ?? []
          for (const row of list) {
            if ((row.defaultText ?? '') !== '') continue
            const family = familyOf(row.name)
            if (!groups.has(family)) groups.set(family, [])
            groups.get(family).push({ kind: kindItem.key, row })
          }
        }
        return [...groups.entries()].map(([family, rows]) => ({ family, rows: rows.sort((a, b) => a.row.name.localeCompare(b.row.name)) }))
      })()

      const scenarioRequests = requests.filter(row => scFilter === 'all' ? true : row.purpose !== 'conversation')

      const head = h('div', { className: 'pl-head' },
        h('h2', null, t('title')),
        h('p', null, t('intro')),
      )

      const profileCard = data === null ? null : h('div', { className: 'pl-card' },
        h('div', { className: 'pl-bar' },
          h('label', { className: 'pl-hint' }, t('activeProfile')),
          h('select', {
            className: 'pl-input', style: { width: '180px' }, value: data.activeProfile, disabled: busy,
            onChange: (event) => activate(event.target.value),
          }, data.profiles.map(profile => h('option', { key: profile.name, value: profile.name }, profile.name))),
          h('button', { className: 'pl-btn', disabled: busy || data.activeProfile === 'default', onClick: () => deleteProfile(data.activeProfile) }, t('deleteProfile')),
          h('button', { className: 'pl-btn', disabled: busy, onClick: exportProfile }, t('exportProfile')),
          h('button', { className: 'pl-btn', disabled: busy, onClick: () => { if (fileInputRef.current) fileInputRef.current.click() } }, t('importProfile')),
          h('input', {
            ref: fileInputRef, type: 'file', accept: 'application/json,.json',
            style: { display: 'none' }, onChange: importProfile,
          }),
          h('button', { className: 'pl-btn', disabled: busy, onClick: copyProfile }, t('copyProfile')),
        ),
        h('div', { className: 'pl-bar' },
          h('input', {
            className: 'pl-input', placeholder: t('newProfile'), value: newProfile, disabled: busy,
            onChange: (event) => setNewProfile(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') createProfile() },
          }),
          h('button', { className: 'pl-btn primary', disabled: busy || newProfile.trim().length === 0, onClick: createProfile }, t('createProfile')),
        ),
        h('div', { className: 'pl-bar' },
          data.profiles.map(profile => h('span', { key: profile.name, className: 'pl-chip' },
            profileChipText(profile))),
        ),
        h('p', { className: 'pl-hint' }, t('profileHint')),
      )

      const bar = h('div', { className: 'pl-bar' },
        h('label', { className: 'pl-hint', title: t('enabledHint') },
          h('input', { type: 'checkbox', checked: Boolean(data?.enabled), disabled: busy, onChange: toggleEnabled }),
          ' ', t('enabled'),
        ),
        h('label', { className: 'pl-hint' }, t('captureMax'),
          h('input', {
            className: 'pl-input', type: 'number', min: 1, step: 1, value: data?.captureMax ?? 8, disabled: busy,
            onChange: (event) => setCaptureMax(event.target.value),
          }),
        ),
        h('label', { className: 'pl-hint', title: t('toolEnabledHint') },
          h('input', { type: 'checkbox', checked: Boolean(data?.toolEnabled), disabled: busy, onChange: toggleTool }),
          ' ', t('toolEnabled'),
        ),
        h('button', { className: 'pl-btn', disabled: busy, onClick: refresh }, t('refresh')),
        busy ? h('span', { className: 'pl-hint' }, t('busy')) : null,
        error === null ? null : h('span', { className: 'pl-error' }, t('failed') + ' ', error),
        notice === null ? null : h('span', { className: 'pl-hint' }, notice),
      )

      const tabs = h('div', { className: 'pl-tabs' },
        [['entries', t('entries')], ['scenarios', t('scenarios')], ['requests', t('requests')], ['assembly', t('assembly')]].map(([key, label]) =>
          h('button', { key, className: 'pl-tab', 'data-active': String(tab === key), onClick: () => setTab(key) }, label)),
      )

      const scopePicker = (() => {
        if (data === null || data.scopes.length === 0) {
          return h('div', { className: 'pl-groups' }, h('span', { className: 'pl-hint' }, t('noScope')))
        }
        const specials = data.scopes.filter(scope => scope.key === 'global' || scope.key === 'overrides')
        const sessions = data.scopes.filter(scope => scope.key !== 'global' && scope.key !== 'overrides')
        // The host keeps observation order oldest -> newest: show only the newest
        // two sessions, plus the selected one so a stale selection stays reachable.
        const visible = sessions.slice(-2)
        if (scopeKey !== null
          && !specials.some(scope => scope.key === scopeKey)
          && !visible.some(scope => scope.key === scopeKey)) {
          const selectedScope = sessions.find(scope => scope.key === scopeKey)
          if (selectedScope !== undefined) visible.push(selectedScope)
        }
        const hidden = Math.max(0, sessions.length - visible.length)
        const button = (candidate) => h('button', {
          key: candidate.key, className: 'pl-group', title: candidate.key,
          'data-active': String(candidate.key === scopeKey),
          onClick: () => {
            setScopeKey(candidate.key)
            setSelected(null)
            setDraft('')
            setScEntry(null)
            setScRequest(null)
            setAssembly(null)
          },
        }, scopeLabel(candidate.key))
        return h('div', { className: 'pl-groups' },
          [...specials, ...visible].map(button),
          hidden > 0 ? h('span', { className: 'pl-hint' }, hidden + ' ' + t('scopeMore')) : null,
        )
      })()

      const list = h('div', { className: 'pl-panel' },
        scopePicker,
        h('div', { className: 'pl-groups' },
          KIND_TABS.map(item => h('button', {
            key: item.key, className: 'pl-group', 'data-active': String(kind === item.key),
            onClick: () => { setKind(item.key); setSelected(null); setDraft('') },
          }, item.label)),
        ),
        entries.length === 0
          ? h('div', { className: 'pl-empty' }, kind === 'tool' ? t('toolsEmpty') : t('empty'))
          : entries.map(row => h('div', {
            key: row.name, className: 'pl-row', 'data-active': String(row.name === selected), onClick: () => selectEntry(row),
          },
          h('div', null,
            h('span', { className: 'pl-dot', 'data-on': String(hasOverride(row.override)) }),
            h('code', null, row.name),
          ),
          h('small', null, row.observed === false
            ? t('unobserved') + (hasOverride(row.override) ? ' · ' + t('overridden') : '')
            : hasOverride(row.override)
              ? t('overridden')
              : (row.defaultText === '' ? t('inactiveNow') : t('notOverridden'))),
          )),
      )

      const detail = h('div', { className: 'pl-panel' },
        entry === null
          ? h('div', { className: 'pl-empty' }, t('empty'))
          : h(EntryEditor, {
            entry, kind, draft, setDraft, busy, activeProfile,
            onSave: save, onRevert: revert,
            onPosition: scopeKey === 'overrides' ? undefined : () => showPosition(kind, entry.name, entry.referenceText),
          }),
      )

      const scenarioLeft = h('div', { className: 'pl-panel' },
        scopePicker,
        h('div', { className: 'pl-sec' }, t('scenarioOverrides')),
        h('div', { className: 'pl-hint', style: { padding: '0 10px 6px' } }, t('scenarioOverrideHint')),
        (data?.scenarioTargets ?? []).length === 0
          ? h('div', { className: 'pl-empty' }, t('scenarioOverrideHint'))
          : (data.scenarioTargets ?? []).map(target => h('div', {
            key: target.key,
            className: 'pl-row',
            'data-active': String(scEntry !== null && scEntry.kind === 'scenario' && scEntry.name === target.key),
            onClick: () => {
              setScEntry({
                kind: 'scenario',
                name: target.key,
                entry: {
                  name: target.key,
                  defaultText: target.defaultText,
                  override: target.override,
                  referenceText: target.referenceText,
                  referenceSource: target.referenceSource,
                },
              })
              setScDraft(target.override ?? '')
              setScRequest(null)
            },
          },
          h('div', null,
            h('span', { className: 'pl-dot', 'data-on': String(hasOverride(target.override)) }),
            h('code', null, target.key),
          ),
          h('small', null, target.purpose + ' · ' + target.role + (hasOverride(target.override) ? ' · ' + t('overridden') : '')),
          )),
        h('div', { className: 'pl-sec' }, t('scenarioEntries')),
        scenarioGroups.length === 0
          ? h('div', { className: 'pl-empty' }, t('noScenarioEntries'))
          : scenarioGroups.map(group => h('div', { key: group.family },
            h('div', { className: 'pl-sec' }, FAMILY_LABELS[group.family]()),
            group.rows.map(({ kind: rowKind, row }) => h('div', {
              key: rowKind + ':' + row.name,
              className: 'pl-row',
              'data-active': String(scEntry !== null && scEntry.name === row.name),
              onClick: () => {
                setScEntry({ kind: rowKind, name: row.name, entry: row })
                setScDraft(row.override ?? '')
                setScRequest(null)
              },
            },
            h('div', null,
              h('span', { className: 'pl-dot', 'data-on': String(hasOverride(row.override)) }),
              h('code', null, row.name),
            ),
            h('small', null, rowKind + (hasOverride(row.override) ? ' · ' + t('overridden') : '')),
            )),
          )),
        h('div', { className: 'pl-sec' }, t('scenarioRequests')),
        h('div', { className: 'pl-groups' },
          h('button', { className: 'pl-group', 'data-active': String(scFilter === 'scenario'), onClick: () => setScFilter('scenario') }, t('scenarioRequests')),
          h('button', { className: 'pl-group', 'data-active': String(scFilter === 'all'), onClick: () => setScFilter('all') }, t('filterAll')),
        ),
        scenarioRequests.length === 0
          ? h('div', { className: 'pl-empty' }, t('noScenarioRequests'))
          : scenarioRequests.map(row => h('div', {
            key: row.id, className: 'pl-row', 'data-active': String(scRequest !== null && scRequest.id === row.id),
            onClick: () => openScenarioRequest(row.id),
          },
          h('div', null, h('code', null, row.provider + ' / ' + row.model)),
          h('small', null, row.at.slice(11, 19) + ' · ' + row.purpose + ' · ' + row.messageCount + ' msg'),
          )),
      )

      const scenarioDetail = h('div', { className: 'pl-panel' },
        scRequest !== null
          ? h(RequestBody, { request: scRequest })
          : scEntry === null
            ? h('div', { className: 'pl-empty' }, t('scenarioHint'))
            : h(EntryEditor, {
              entry: scEntry.entry, kind: scEntry.kind, draft: scDraft, setDraft: setScDraft, busy, activeProfile,
              onSave: saveScenario, onRevert: revertScenario,
              onPosition: scEntry.kind === 'scenario'
                ? undefined
                : () => showPosition(scEntry.kind, scEntry.name, scEntry.entry.referenceText),
            }),
      )

      const requestsList = h('div', { className: 'pl-panel' },
        requests.length === 0 ? h('div', { className: 'pl-empty' }, t('noRequests')) : requests.map(row =>
          h('div', {
            key: row.id, className: 'pl-row', 'data-active': String(row.id === requestId),
            onClick: () => openRequest(row.id),
          },
          h('div', null, h('code', null, row.provider + ' / ' + row.model)),
          h('small', null, row.at.slice(11, 19) + ' · ' + row.purpose + ' · ' + row.messageCount + ' msg · ' + (row.profile ?? '') + ' · ' + scopeLabel(row.sessionId)),
          )),
        h('div', { className: 'pl-detail' },
          h('button', { className: 'pl-btn', disabled: busy, onClick: clearRequests }, t('clearRequests')),
        ),
      )

      const requestView = h('div', { className: 'pl-panel' },
        request === null
          ? h('div', { className: 'pl-empty' }, t('noRequests'))
          : h(RequestBody, { request }),
      )

      const assemblyView = h('div', { className: 'pl-panel' },
        h('div', { className: 'pl-detail' },
          h('div', { className: 'pl-bar' },
            h('button', { className: 'pl-btn primary', disabled: busy, onClick: assemble }, t('preview')),
            h('span', { className: 'pl-hint' }, t('previewHint')),
          ),
          assembly === null
            ? h('div', { className: 'pl-empty' }, t('previewHint'))
            : h('div', null,
              h('label', null, t('systemPrompt')),
              h('pre', { className: 'pl-pre' }, assembly.systemPrompt),
              h('label', null, t('toolSchemas') + ' (' + (assembly.toolNames ?? []).length + ')'),
              h('div', null, (assembly.toolNames ?? []).map(toolName => h('span', { key: toolName, className: 'pl-chip' }, toolName))),
              (assembly.contexts ?? []).map((context, index) => h('details', { key: 'ctx-' + index },
                h('summary', null, 'context · ' + context.name),
                h('pre', null, context.text),
              )),
            ),
        ),
      )

      const body = tab === 'entries'
        ? h('div', { className: 'pl-body' }, list, detail)
        : tab === 'scenarios'
          ? h('div', { className: 'pl-body' }, scenarioLeft, scenarioDetail)
          : tab === 'requests'
            ? h('div', { className: 'pl-body' }, requestsList, requestView)
            : assemblyView

      const positionOverlay = position === null ? null : h('div', { className: 'pl-overlay', onClick: () => setPosition(null) },
        h('div', { className: 'pl-overlay-panel', onClick: (event) => event.stopPropagation() },
          h('div', { className: 'pl-overlay-head' },
            h('h3', null, t('positionTitle') + ' · ' + position.name),
            h('button', { className: 'pl-btn', onClick: () => setPosition(null) }, t('close')),
          ),
          h('p', { className: 'pl-hint' }, t('positionHint')),
          h('div', { className: 'pl-detail' },
            (position.assembly.sections ?? []).map((section, index) => {
              const target = position.kind === 'section' && section.name === position.name
              const text = target ? (position.referenceText ?? section.text ?? '') : (section.text ?? '')
              return h('details', { key: 'pos-s-' + index, open: target, className: 'pl-msg', 'data-target': String(target) },
                h('summary', null, (index + 1) + '. ' + section.name + ' · ' + (text.length > 0 ? text.length + ' chars' : 'inactive')),
                h('pre', null, text),
              )
            }),
            (position.assembly.contexts ?? []).map((context, index) => {
              const target = position.kind === 'context' && context.name === position.name
              const text = target ? (position.referenceText ?? context.text ?? '') : (context.text ?? '')
              return h('details', { key: 'pos-c-' + index, open: target, className: 'pl-msg', 'data-target': String(target) },
                h('summary', null, 'context ' + context.name + ' · ' + (text.length > 0 ? text.length + ' chars' : 'inactive')),
                h('pre', null, text),
              )
            }),
          ),
        ),
      )

      return h('div', { className: 'pl-root' }, head, profileCard, bar, tabs, body, positionOverlay)
    }

    function LabPage(props) {
      return h(Boundary, null, h(Page, props))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return
        ctx.effect(insertStyles, 'prompt-lab:styles')
        ctx.effect(() => slots.inject('settings.section', () => slots.register({
          name: 'settings.section',
          id: NS,
          order: 30,
          label: () => t('title'),
        }, LabPage)), 'prompt-lab:settings-page')
      },
    }
  },
})
