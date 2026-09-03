// dsh-tool-autoexpand 的浏览器半身，按标准 dsh client bundle 形态构建。
//
// 产物形态与部署自带的 client bundle 一致，通过 window.__ModuleLoader__.load({ id, factory }) 注册模块表条目。
// factory 用 loader 注入的 require 解析外部依赖，其中 `react` 返回由 shell seed 保活的平台模块表实例，
// 见 packages/client/web/src/seed.ts。
// 默认导出即浏览器内核采纳并挂载的 Cordis 插件对象。
//
// 功能：监听会话里新渲染的工具调用卡片，按侧栏开关设定的模式处理每张卡片的顶层折叠行。
// ReadBlock/TerminalBlock/DiffBlock/SearchBlock 内部的「… 其余 N 行」行数折叠保持不动。
// 那些内层折叠是真 <button>，因此跳过所有 <button> 即可保证永不打开第二级折叠。
// 侧栏底部开关是「四态逻辑 + 三态 UI」：逻辑档位 0不干预/1展开/2不干预/3折叠，点击按
// (mode+1)%4 循环；其中两个「不干预」档 0 与 2 在界面上显示为同一种样子。
// 开关状态持久化到 localStorage，存 '0'/'1'/'2'/'3'，并兼容旧版 '0'/'1' 数据。

window.__ModuleLoader__.load({
  id: 'dsh-tool-autoexpand',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    const React = require('react')

    const plugin = {
      name: 'dsh-tool-autoexpand',
      inject: ['slots', 'timer'],
      apply(ctx) {
        const timer = ctx.get && ctx.get('timer')
        const slots = ctx.get && ctx.get('slots')
        if (!timer || !slots) return

        const DOC = typeof document !== 'undefined' ? document : null

        const state = { mode: 1 }
        // 把开关档位持久化到 localStorage，刷新后保持；存储值优先于内置默认值。
        const STORE_KEY = 'dsh-tool-autoexpand.enabled'
        const storedMode = readStoredMode()
        if (storedMode !== null) state.mode = storedMode
        const handled = typeof WeakSet !== 'undefined' ? new WeakSet() : null
        let observer = null
        let retryDisposers = []
        let styleTag = null

        // 侧栏底部开关的样式。
        // 开关是一张「小卡片」——清晰的标题加描述行，再加一个分段胶囊开关，一眼就能看懂用途。
        // 颜色跟随 dsh 主题别名 token，因而明暗主题都能自然融入；除此之外本插件不改动任何全局主题。
        // 用 data-plugin 属性标识，HMR 时能可靠地在 DOM 中定位自己的 style 标签。
        const STYLE_PLUGIN_ATTR = 'dsh-tool-autoexpand'
        function ensureStyle() {
          if (!DOC) return
          const css = [
            '.dshe-toolx-toggle{display:flex;flex-direction:column;gap:5px;width:100%;min-width:0;padding:7px 9px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:transparent;cursor:pointer;text-align:left;color:var(--dsw-alias-label-primary);font-family:inherit;transition:background .12s ease,border-color .12s ease}',
            '.dshe-toolx-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}',
            '.dshe-toolx-toggle:active{background:var(--dsw-alias-interactive-bg-active)}',
            '.dshe-toolx-head{display:flex;align-items:center;gap:7px;min-width:0}',
            '.dshe-toolx-icon{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;font-style:normal;opacity:.85}',
            '.dshe-toolx-title{font-size:12.5px;font-weight:600;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.dshe-toolx-desc{font-size:11px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary)}',
            // 分段胶囊开关固定在头部右侧
            '.dshe-toolx-pill{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 7px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-surface-elevated);font-size:10.5px;line-height:1;font-weight:600;letter-spacing:.2px}',
            // 三态平等：pill 均不带背景色，统一为常规文字样式，靠文字内容区分状态。
            '.dshe-toolx-pill{color:var(--dsw-alias-label-secondary)}',
            // sidebar footer action 是行方向 flex 容器，多个插件按钮会被左右挤压；
            // 容器内含本插件开关时转纵向排列
            '[class*="footerActions"]:has(button.dshe-toolx-toggle){flex-direction:column;align-items:stretch}',
            // 侧栏收起时依据 frame 根节点的 data-sidebar-collapsed 属性切换单图标模式。
            // 隐藏标题/描述/ON-OFF 胶囊，按钮收成 36x36 图标方块，避免溢出窄 rail。
            // 尺寸与边缘样式对齐 DSH 原生「新建会话」图标按钮，36x36、radius 12px、透明边框。
            // 本按钮是开关，开启状态下额外呈现 hover 背景作为状态提示。
            // 收起态 specificity 高于 :hover，故开启时背景常驻、视觉等同悬停，无绿色描边。
            // 收起态禁用 transition，否则 data-mode 切换时的 background 过渡会卡滞在 hover 色上，
            // 关闭状态背景无法回到 transparent。
            '[data-sidebar-collapsed] [class*="footerActions"]:has(button.dshe-toolx-toggle){align-items:center}',
            '[data-sidebar-collapsed] button.dshe-toolx-toggle{width:36px;height:36px;padding:0;align-items:center;justify-content:center;border-radius:12px;border-color:transparent;transition:none}',
            '[data-sidebar-collapsed] .dshe-toolx-title,[data-sidebar-collapsed] .dshe-toolx-desc,[data-sidebar-collapsed] .dshe-toolx-pill{display:none}',
            '[data-sidebar-collapsed] .dshe-toolx-head{gap:0}',
            // 收起态同一图标：三态平等，统一用常规前景色，不再为某档高亮。
          ].join('')
          // 优先通过 DOM 查询：若 <head> 里已有同名 data-plugin 的 style 标签则直接复用并刷新内容
          const existing = DOC.querySelector('style[data-plugin="' + STYLE_PLUGIN_ATTR + '"]')
          if (existing) { styleTag = existing; styleTag.textContent = css; return }
          const tag = DOC.createElement('style')
          tag.dataset.plugin = STYLE_PLUGIN_ATTR
          tag.textContent = css
          DOC.head.appendChild(tag)
          styleTag = tag
        }

        // 只展开工具调用卡片的顶层折叠行。
        // 顶层行是带 aria-expanded="false" 的非 <button> 元素：
        // DisclosureRow 渲染 role=button 的 <div data-disclosure-row>，
        // bash 变体渲染 <div data-variant="bash" role="button">。
        // 内层「… 其余 N 行」/「收起」是真 <button>，跳过所有 <button> 就能让卡片的行数折叠保持原样。
        function expandCard(root) {
          if (!(root instanceof HTMLElement)) return
          const candidates = root.querySelectorAll('[aria-expanded="false"]')
          for (const el of candidates) {
            if (!(el instanceof HTMLElement)) continue
            if (el.tagName === 'BUTTON') continue // 内层「展开其余 N 行」开关，跳过
            if (el.disabled) continue
            try { el.click() } catch (e) { console.warn('[dsh-tool-autoexpand] click failed:', e) }
          }
        }

        function expandCardWithRetries(root) {
          expandCard(root)
          retryDisposers.push(timer.timeout(() => expandCard(root), 180))
          retryDisposers.push(timer.timeout(() => expandCard(root), 450))
        }

        // 只折叠工具调用卡片的顶层折叠行，与 expandCard 对称。
        // 点击每个 aria-expanded="true" 且非 <button> 的元素。
        // 内层「… 其余 N 行」/「收起」是真 <button>，会被跳过，
        // 卡片只收回到摘要行，不会缩进嵌套的行数块。
        function collapseCard(root) {
          if (!(root instanceof HTMLElement)) return
          const candidates = root.querySelectorAll('[aria-expanded="true"]')
          for (const el of candidates) {
            if (!(el instanceof HTMLElement)) continue
            if (el.tagName === 'BUTTON') continue
            if (el.disabled) continue
            try { el.click() } catch (e) { console.warn('[dsh-tool-autoexpand] collapse click failed:', e) }
          }
        }

        // 折叠页面上所有已展开的工具调用卡片。
        // 开关切到 OFF 时调用，让之前自动展开的卡片当场收回，而不是保持打开。
        function collapseAll() {
          if (!DOC) return
          const roots = DOC.querySelectorAll('[data-chat-flow-kind="tool-call"]')
          for (const root of roots) {
            if (root instanceof HTMLElement) collapseCard(root)
          }
        }

        // 展开页面上所有已存在的工具调用卡片，与 collapseAll 对称。
        // 开关切回 ON 时调用，让当前页面立刻全部展开，不等后续新卡片。
        function expandAll() {
          if (!DOC) return
          const roots = DOC.querySelectorAll('[data-chat-flow-kind="tool-call"]')
          for (const root of roots) {
            if (root instanceof HTMLElement) expandCard(root)
          }
        }

        function stop() {
          if (observer) { try { observer.disconnect() } catch {} observer = null }
          for (const dispose of retryDisposers) { try { dispose() } catch {} }
          retryDisposers = []
        }

        function rootTarget() {
          if (!DOC) return null
          return DOC.querySelector('#root') || DOC.documentElement
        }

        function start() {
          if (!DOC || observer) return
          const target = rootTarget()
          if (!target) return
          observer = new MutationObserver(function (mutations) {
            for (const mutation of mutations) {
              for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue
                let roots = node.matches && node.matches('[data-chat-flow-kind="tool-call"]')
                  ? [node]
                  : (node.querySelectorAll ? Array.from(node.querySelectorAll('[data-chat-flow-kind="tool-call"]')) : [])
                for (const root of roots) {
                  if (!(root instanceof HTMLElement)) continue
                  if (handled && handled.has(root)) continue
                  if (handled) handled.add(root)
                  expandCardWithRetries(root)
                }
              }
            }
          })
          observer.observe(target, { childList: true, subtree: true })
        }

        // 收起态/展开态共用的图标，语义为「自动展开工具调用」。
        // 上方三条横线表示内容行，底部是向下展开的实心箭头。
        // 单色 fill="currentColor" 跟随主题，与 DSH 原生内联 SVG 图标风格一致，
        // 16x16 视口、圆角、等宽笔画。
        function ToolExpandIcon() {
          return React.createElement(
            'svg',
            {
              viewBox: '0 0 16 16',
              width: 16,
              height: 16,
              fill: 'currentColor',
              'aria-hidden': 'true',
            },
            React.createElement('rect', { x: 2.5, y: 3, width: 11, height: 1.8, rx: 0.9 }),
            React.createElement('rect', { x: 2.5, y: 6, width: 9, height: 1.8, rx: 0.9 }),
            React.createElement('rect', { x: 2.5, y: 9, width: 7, height: 1.8, rx: 0.9 }),
            React.createElement('path', { d: 'M8 11 10.4 13.4 8 15.8 5.6 13.4 8 11Z' })
          )
        }

        // localStorage 可能抛错，隐私模式或禁用存储时静默降级。
        // 档位用字符串 '0'/'1'/'2'/'3' 存储；旧版只有 '1' 开/展开 与 '0' 关/折叠。
        // 兼容映射：旧 '1' -> 展开档 1；旧 '0' -> 不干预档 0，语义收敛到中性默认档。
        function readStoredMode() {
          if (!DOC || !DOC.defaultView || !DOC.defaultView.localStorage) return null
          try {
            const v = DOC.defaultView.localStorage.getItem(STORE_KEY)
            if (v === '1') return 1
            if (v === '0') return 0
            if (v === '2') return 2
            if (v === '3') return 3
          } catch (e) { console.warn('[dsh-tool-autoexpand] restore toggle mode failed:', e) }
          return null
        }

        function writeStoredMode(mode) {
          if (!DOC || !DOC.defaultView || !DOC.defaultView.localStorage) return
          try { DOC.defaultView.localStorage.setItem(STORE_KEY, String(mode)) } catch (e) { console.warn('[dsh-tool-autoexpand] save toggle mode failed:', e) }
        }

        // 四态逻辑 + 三态 UI 的档位元数据。
        // 逻辑有 4 档，但 0 与 2 同为「不干预」，界面上合并显示为同一种三态外观，
        // 只保留「不干预 / 展开 / 折叠」三种可感知状态。
        const MODE_META = {
          0: { pill: '不干预', title: '展开工具调用：不干预', desc: '不做处理' },
          1: { pill: '　展开', title: '展开工具调用：展开', desc: '全部展开' },
          2: { pill: '不干预', title: '展开工具调用：不干预', desc: '不做处理' },
          3: { pill: '折叠　', title: '展开工具调用：折叠', desc: '全部折叠' },
        }

        // 按档位应用全局行为：只对「展开」档启动观察器并展开全页，
        // 「折叠」档停止观察器并折叠全页，两个「不干预」档停止观察器且不动已有卡片。
        function applyMode(mode) {
          if (mode === 1) { start(); expandAll() }
          else if (mode === 3) { stop(); collapseAll() }
          else { stop() }
        }

        function Toggle() {
          const [mode, setMode] = React.useState(state.mode)
          const meta = MODE_META[mode] || MODE_META[0]
          return React.createElement(
            'button',
            {
              className: 'dshe-toolx-toggle',
              'data-mode': String(mode),
              type: 'button',
              title: meta.title,
              'aria-label': meta.title,
              onClick: function () {
                const next = (mode + 1) % 4
                setMode(next)
                state.mode = next
                writeStoredMode(next)
                applyMode(next)
              },
            },
            React.createElement(
              'div',
              { className: 'dshe-toolx-head' },
              React.createElement('span', { className: 'dshe-toolx-icon', 'aria-hidden': 'true' }, React.createElement(ToolExpandIcon)),
              React.createElement('span', { className: 'dshe-toolx-title' }, '展开工具调用'),
              React.createElement('span', { className: 'dshe-toolx-pill' }, meta.pill)
            ),
            React.createElement('div', { className: 'dshe-toolx-desc' }, meta.desc)
          )
        }

        slots.inject('sidebar.footer.action', function () {
          return slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'dsh-tool-autoexpand-toggle',
              order: 20,
            },
            () => React.createElement(Toggle)
          )
        })

        ctx.effect(function () {
          ensureStyle()
          applyMode(state.mode)
          return function () {
            stop()
            // 同时按闭包变量和 data-plugin 属性查找，防止遗漏
            let tag = styleTag
            if (!tag || !tag.parentNode) {
              tag = DOC && DOC.querySelector('style[data-plugin="' + STYLE_PLUGIN_ATTR + '"]')
            }
            if (tag && tag.parentNode) tag.parentNode.removeChild(tag)
            styleTag = null
          }
        })
      },
    }

    exports.default = plugin
    exports.name = plugin.name
    exports.inject = plugin.inject
    exports.apply = plugin.apply

    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    return module.exports
  },
})
