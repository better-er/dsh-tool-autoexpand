// Browser half of dsh-tool-autoexpand, built as a standard dsh client bundle.
//
// Artifact shape follows the deployment's own client bundles: register a module
// table entry through window.__ModuleLoader__.load({ id, factory }). The factory
// resolves its externals through the loader's injected require, which for
// `react` returns the platform module-table instance kept alive by the shell
// seed (packages/client/web/src/seed.ts). The default export is the Cordis
// plugin object the browser kernel adopts and mounts.
//
// Feature: watch the conversation for freshly-rendered tool-call cards and
// auto-expand each card's TOP-LEVEL disclosure row, leaving the inner
// "… 其余 N 行" line-count folds inside ReadBlock/TerminalBlock/DiffBlock/
// SearchBlock untouched (those are real <button>s, so skipping every <button>
// guarantees we never open a second-level fold). A sidebar footer toggle
// switches auto-expand on/off (default on).

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

        const state = { enabled: true }
        const handled = typeof WeakSet !== 'undefined' ? new WeakSet() : null
        let observer = null
        let retryDisposers = []
        let styleTag = null

        // Sidebar footer toggle styling. The toggle is a small "card" — a clear
        // label + description line plus a segmented pill switch — so its purpose
        // is obvious at a glance. Colors ride the dsh theme alias tokens so it
        // blends into both light and dark themes; the plugin touches no global
        // theme otherwise.
        function ensureStyle() {
          if (!DOC || styleTag) return
          const css = [
            '.dshe-toolx-toggle{display:flex;flex-direction:column;gap:5px;width:100%;min-width:0;padding:7px 9px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:transparent;cursor:pointer;text-align:left;color:var(--dsw-alias-label-primary);font-family:inherit;transition:background .12s ease,border-color .12s ease}',
            '.dshe-toolx-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}',
            '.dshe-toolx-toggle:active{background:var(--dsw-alias-interactive-bg-active)}',
            '.dshe-toolx-head{display:flex;align-items:center;gap:7px;min-width:0}',
            '.dshe-toolx-icon{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;font-style:normal;opacity:.85}',
            '.dshe-toolx-title{font-size:12.5px;font-weight:600;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.dshe-toolx-desc{font-size:11px;line-height:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary)}',
            // the segmented pill switch rides the right side of the header
            '.dshe-toolx-pill{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:5px;height:20px;padding:0 7px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-surface-elevated);font-size:10.5px;line-height:1;font-weight:600;letter-spacing:.2px}',
            '.dshe-toolx-toggle[data-on="true"] .dshe-toolx-pill{background:var(--dsw-alias-state-business-secondary);border-color:transparent;color:var(--dsw-alias-state-business-foreground,var(--dsw-alias-label-primary))}',
            '.dshe-toolx-toggle[data-on="false"] .dshe-toolx-pill{color:var(--dsw-alias-label-tertiary)}',
          ].join('')
          const tag = DOC.createElement('style')
          tag.textContent = css
          DOC.head.appendChild(tag)
          styleTag = tag
        }

        // Expand ONLY the top-level disclosure row of a tool-call card.
        // Top-level rows are non-<button> elements carrying aria-expanded="false"
        // (DisclosureRow renders a role=button <div data-disclosure-row>;
        // the bash flavor renders <div data-variant="bash" role="button">).
        // Inner "… 其余 N 行"/"收起" folds are real <button>s, so skipping every
        // <button> leaves the card's line-count disclosure untouched.
        function expandCard(root) {
          if (!(root instanceof HTMLElement)) return
          const candidates = root.querySelectorAll('[aria-expanded="false"]')
          for (const el of candidates) {
            if (!(el instanceof HTMLElement)) continue
            if (el.tagName === 'BUTTON') continue // inner "展开其余 N 行" toggle — skip
            if (el.disabled) continue
            try { el.click() } catch {}
          }
        }

        function expandCardWithRetries(root) {
          expandCard(root)
          retryDisposers.push(timer.timeout(() => expandCard(root), 180))
          retryDisposers.push(timer.timeout(() => expandCard(root), 450))
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

        function Toggle() {
          const [on, setOn] = React.useState(state.enabled)
          const icon = on ? '\u2713' : '\u25B6' // ✓ when on, ▶ when off
          const title = on ? '自动展开工具调用：开' : '自动展开工具调用：关'
          const desc = on ? '新到达的工具调用自动展开' : '工具调用保持手动展开'
          const pill = on ? 'ON' : 'OFF'
          return React.createElement(
            'button',
            {
              className: 'dshe-toolx-toggle',
              'data-on': on ? 'true' : 'false',
              type: 'button',
              title: title,
              'aria-label': '自动展开工具调用',
              'aria-pressed': on ? 'true' : 'false',
              onClick: function () {
                const next = !on
                setOn(next)
                state.enabled = next
                if (next) start(); else stop()
              },
            },
            React.createElement(
              'div',
              { className: 'dshe-toolx-head' },
              React.createElement('span', { className: 'dshe-toolx-icon', 'aria-hidden': 'true' }, icon),
              React.createElement('span', { className: 'dshe-toolx-title' }, '展开工具调用'),
              React.createElement('span', { className: 'dshe-toolx-pill' }, pill)
            ),
            React.createElement('div', { className: 'dshe-toolx-desc' }, desc)
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
          if (state.enabled) start()
          return function () {
            stop()
            if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag)
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
