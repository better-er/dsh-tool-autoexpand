/**
 * dsh-tool-autoexpand 的浏览器半身。
 *
 * 功能：监听会话里新渲染的工具调用卡片，按侧栏开关设定的模式处理每张卡片的顶层折叠行。
 * ReadBlock/TerminalBlock/DiffBlock/SearchBlock 内部的「… 其余 N 行」行数折叠保持不动。
 * 那些内层折叠是真 <button>，因此跳过所有 <button> 即可保证永不打开第二级折叠。
 * 侧栏底部开关是「四态逻辑 + 三态 UI」：逻辑档位 0不干预/1展开/2不干预/3折叠，点击按
 * (mode+1)%4 循环；其中两个「不干预」档 0 与 2 在界面上显示为同一种样子。
 * 开关状态持久化到 localStorage，存 '0'/'1'/'2'/'3'，并兼容旧版 '0'/'1' 数据。
 *
 * @module dsh-tool-autoexpand/client
 */
import { useState, type ReactElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ensureStyle, removeStyle } from './style.ts'

/** 插件名，同时也是配置项 id。 */
export const name = 'dsh-tool-autoexpand'
/** 本插件需要的客户端服务。 */
export const inject = ['slots', 'timer']

/** 定时器服务的最小面，用于展开后补几次重试。 */
interface TimerService {
  /** 延迟执行一次，返回取消函数。 */
  timeout(callback: () => void, delayMs: number): () => void
}

/** 开关档位：0 不干预，1 展开，2 不干预，3 折叠。 */
type Mode = 0 | 1 | 2 | 3

/** 单档在界面上的文案。 */
interface ModeMeta {
  readonly pill: string
  readonly title: string
  readonly desc: string
}

/** localStorage 键名，沿用旧版以便无缝升级。 */
const STORE_KEY = 'dsh-tool-autoexpand.enabled'

/** 非按钮元素也可能带 disabled 属性，读不到时按未禁用处理。 */
function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLElement & { disabled?: boolean }).disabled === true
}

/**
 * 四态逻辑 + 三态 UI 的档位元数据。
 * 逻辑有 4 档，但 0 与 2 同为「不干预」，界面上合并显示为同一种三态外观，只保留「不干预 / 展开 / 折叠」三种可感知状态。
 */
const MODE_META: Record<Mode, ModeMeta> = {
  0: { pill: '不干预', title: '展开工具调用：不干预', desc: '不做处理' },
  1: { pill: '　展开', title: '展开工具调用：展开', desc: '全部展开' },
  2: { pill: '不干预', title: '展开工具调用：不干预', desc: '不做处理' },
  3: { pill: '折叠　', title: '展开工具调用：折叠', desc: '全部折叠' },
}

/**
 * 把自动展开逻辑与侧栏开关挂到客户端上下文。
 * @param ctx 客户端根上下文。
 */
export function apply(ctx: ClientContext): void {
  const timerService = ctx.get('timer') as TimerService | undefined
  if (!timerService) return
  const timer: TimerService = timerService
  const slots = ctx.slots
  const DOC: Document | null = typeof document !== 'undefined' ? document : null

  /** 当前档位，先给默认值，再由 localStorage 覆盖。 */
  const state: { mode: Mode } = { mode: 1 }
  const storedMode = readStoredMode()
  if (storedMode !== null) state.mode = storedMode

  /** 已处理过的卡片根节点，避免观察器重复展开同一张卡。 */
  const handled: WeakSet<Element> | null = typeof WeakSet !== 'undefined' ? new WeakSet<Element>() : null
  let observer: MutationObserver | null = null
  let retryDisposers: Array<() => void> = []
  let styleTag: HTMLStyleElement | null = null

  /**
   * 只展开工具调用卡片的顶层折叠行。
   * 顶层行是带 aria-expanded="false" 的非 <button> 元素：DisclosureRow 渲染 role=button 的 <div data-disclosure-row>，
   * bash 变体渲染 <div data-variant="bash" role="button">。
   * 内层「… 其余 N 行」/「收起」是真 <button>，跳过所有 <button> 就能让卡片的行数折叠保持原样。
   */
  function expandCard(root: Element): void {
    if (!(root instanceof HTMLElement)) return
    for (const el of root.querySelectorAll<HTMLElement>('[aria-expanded="false"]')) {
      if (el.tagName === 'BUTTON') continue // 内层「展开其余 N 行」开关，跳过
      if (isDisabled(el)) continue
      try {
        el.click()
      } catch (error) {
        console.warn('[dsh-tool-autoexpand] click failed:', error)
      }
    }
  }

  /** 展开后补两次重试，等卡片内部结构渲染完成再补点一次。 */
  function expandCardWithRetries(root: Element): void {
    expandCard(root)
    retryDisposers.push(timer.timeout(() => expandCard(root), 180))
    retryDisposers.push(timer.timeout(() => expandCard(root), 450))
  }

  /**
   * 只折叠工具调用卡片的顶层折叠行，与 expandCard 对称。
   * 点击每个 aria-expanded="true" 且非 <button> 的元素；内层行数折叠是真 <button>，会被跳过，
   * 卡片只收回到摘要行，不会缩进嵌套的行数块。
   */
  function collapseCard(root: Element): void {
    if (!(root instanceof HTMLElement)) return
    for (const el of root.querySelectorAll<HTMLElement>('[aria-expanded="true"]')) {
      if (el.tagName === 'BUTTON') continue
      if (isDisabled(el)) continue
      try {
        el.click()
      } catch (error) {
        console.warn('[dsh-tool-autoexpand] collapse click failed:', error)
      }
    }
  }

  /** 折叠页面上所有已展开的工具调用卡片，开关切到折叠档时调用。 */
  function collapseAll(): void {
    if (!DOC) return
    for (const root of DOC.querySelectorAll('[data-chat-flow-kind="tool-call"]')) collapseCard(root)
  }

  /** 展开页面上所有已存在的工具调用卡片，开关切到展开档时调用。 */
  function expandAll(): void {
    if (!DOC) return
    for (const root of DOC.querySelectorAll('[data-chat-flow-kind="tool-call"]')) expandCard(root)
  }

  /** 停止观察器并取消所有待触发的重试。 */
  function stop(): void {
    if (observer) {
      try {
        observer.disconnect()
      } catch {}
      observer = null
    }
    for (const dispose of retryDisposers) {
      try {
        dispose()
      } catch {}
    }
    retryDisposers = []
  }

  /** 观察根节点，选择 #root 以便覆盖整个会话流。 */
  function rootTarget(): Element | null {
    if (!DOC) return null
    return DOC.querySelector('#root') ?? DOC.documentElement
  }

  /** 启动观察器，处理此后新插入的工具调用卡片。 */
  function start(): void {
    if (!DOC || observer) return
    const target = rootTarget()
    if (!target) return
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue
          const roots = node.matches('[data-chat-flow-kind="tool-call"]')
            ? [node]
            : Array.from(node.querySelectorAll('[data-chat-flow-kind="tool-call"]'))
          for (const root of roots) {
            if (!(root instanceof HTMLElement)) continue
            if (handled) {
              if (handled.has(root)) continue
              handled.add(root)
            }
            expandCardWithRetries(root)
          }
        }
      }
    })
    observer.observe(target, { childList: true, subtree: true })
  }

  /**
   * localStorage 可能抛错，隐私模式或禁用存储时静默降级。
   * 档位用字符串 '0'/'1'/'2'/'3' 存储；旧版只有 '1' 开/展开 与 '0' 关/折叠。
   * 兼容映射：旧 '1' -> 展开档 1；旧 '0' -> 不干预档 0，语义收敛到中性默认档。
   */
  function readStoredMode(): Mode | null {
    const storage = DOC?.defaultView?.localStorage
    if (!storage) return null
    try {
      const value = storage.getItem(STORE_KEY)
      if (value === '0' || value === '1' || value === '2' || value === '3') return Number(value) as Mode
    } catch (error) {
      console.warn('[dsh-tool-autoexpand] restore toggle mode failed:', error)
    }
    return null
  }

  /** 持久化档位，存储不可用时静默降级。 */
  function writeStoredMode(mode: Mode): void {
    const storage = DOC?.defaultView?.localStorage
    if (!storage) return
    try {
      storage.setItem(STORE_KEY, String(mode))
    } catch (error) {
      console.warn('[dsh-tool-autoexpand] save toggle mode failed:', error)
    }
  }

  /**
   * 按档位应用全局行为：只对「展开」档启动观察器并展开全页，
   * 「折叠」档停止观察器并折叠全页，两个「不干预」档停止观察器且不动已有卡片。
   */
  function applyMode(mode: Mode): void {
    if (mode === 1) {
      start()
      expandAll()
    } else if (mode === 3) {
      stop()
      collapseAll()
    } else {
      stop()
    }
  }

  /**
   * 收起态/展开态共用的图标，语义为「自动展开工具调用」。
   * 上方三条横线表示内容行，底部是向下展开的实心箭头；单色 currentColor 跟随主题。
   */
  function ToolExpandIcon(): ReactElement {
    return (
      <svg viewBox="0 0 16 16" width={16} height={16} fill="currentColor" aria-hidden="true">
        <rect x={2.5} y={3} width={11} height={1.8} rx={0.9} />
        <rect x={2.5} y={6} width={9} height={1.8} rx={0.9} />
        <rect x={2.5} y={9} width={7} height={1.8} rx={0.9} />
        <path d="M8 11 10.4 13.4 8 15.8 5.6 13.4 8 11Z" />
      </svg>
    )
  }

  /** 侧栏底部的开关卡，点击在四档间循环。 */
  function Toggle(): ReactElement {
    const [mode, setMode] = useState<Mode>(state.mode)
    const meta = MODE_META[mode]
    return (
      <button
        className="dshe-toolx-toggle"
        data-mode={String(mode)}
        type="button"
        title={meta.title}
        aria-label={meta.title}
        onClick={() => {
          const next = ((mode + 1) % 4) as Mode
          setMode(next)
          state.mode = next
          writeStoredMode(next)
          applyMode(next)
        }}
      >
        <div className="dshe-toolx-head">
          <span className="dshe-toolx-icon" aria-hidden="true">
            <ToolExpandIcon />
          </span>
          <span className="dshe-toolx-title">展开工具调用</span>
          <span className="dshe-toolx-pill">{meta.pill}</span>
        </div>
        <div className="dshe-toolx-desc">{meta.desc}</div>
      </button>
    )
  }

  slots.inject('sidebar.footer.action', () =>
    slots.register(
      {
        name: 'sidebar.footer.action',
        id: 'dsh-tool-autoexpand-toggle',
        order: 20,
      },
      Toggle,
    ),
  )

  ctx.effect(() => {
    if (DOC) styleTag = ensureStyle(DOC)
    applyMode(state.mode)
    return () => {
      stop()
      if (DOC) removeStyle(DOC, styleTag)
      styleTag = null
    }
  })
}

/** 兼容旧产物的默认导出形态：同时提供命名导出与 default。 */
export default { name, inject, apply }
