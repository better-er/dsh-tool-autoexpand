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
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

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

/** sidebar.footer.action 槽位注入的 owner 面。 */
interface ToggleProps {
  /** 侧栏是否为宽栏；false 表示收起成窄 rail。 */
  readonly wide: boolean
}

/** 开关卡头部一行：图标、标题、状态胶囊。 */
const HEAD_STYLE: CSSProperties = { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }
/** 收起态头部去掉间距，只留居中的图标。 */
const HEAD_COLLAPSED_STYLE: CSSProperties = { ...HEAD_STYLE, gap: 0 }
/** 头部左侧图标。 */
const ICON_STYLE: CSSProperties = {
  display: 'inline-flex',
  flex: 'none',
  width: '16px',
  height: '16px',
  alignItems: 'center',
  justifyContent: 'center',
  opacity: 0.85,
}
/** 卡片标题。 */
const TITLE_STYLE: CSSProperties = {
  fontSize: '12.5px',
  fontWeight: 600,
  lineHeight: '16px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
/** 卡片副标题，说明当前档位做了什么。 */
const DESC_STYLE: CSSProperties = {
  fontSize: '11px',
  lineHeight: '14px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: 'var(--dsw-alias-label-secondary)',
}
/** 头部右侧的状态胶囊，三态平等，靠文字区分。 */
const PILL_STYLE: CSSProperties = {
  marginLeft: 'auto',
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  height: '20px',
  padding: '0 7px',
  borderRadius: '10px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'var(--dsw-alias-surface-elevated)',
  fontSize: '10.5px',
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: '.2px',
  color: 'var(--dsw-alias-label-secondary)',
}

/** 提示图标：点开或悬浮时给出抗折叠说明。 */
const HINT_ICON_STYLE: CSSProperties = {
  flex: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '14px',
  height: '14px',
  borderRadius: '50%',
  border: '1px solid var(--dsw-alias-border-l2)',
  fontSize: '9.5px',
  lineHeight: 1,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-secondary)',
  cursor: 'pointer',
}

/** 提示行：说明抗折叠该用 DSH 自带的展示模式，插件不再重复实现。 */
const HINT_STYLE: CSSProperties = {
  fontSize: '10.5px',
  lineHeight: '14px',
  whiteSpace: 'normal',
  color: 'var(--dsw-alias-label-secondary)',
  opacity: 0.85,
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

  let observer: MutationObserver | null = null
  /** 待清理的延迟重试取消函数，触发后自动移除，避免长会话里不断堆积。 */
  const retryDisposers = new Set<() => void>()

  /**
   * 展开包含卡片的 turn-process 折叠组。
   *
   * next 把一次回合里的工具调用收进 turn-process 组，组内卡片带 hidden="until-found"，
   * 不先点开组按钮，卡片不会现身。按卡片的 data-chat-turn 找到同一回合的组按钮。
   * 旧版没有这一层，选择器匹配为空，天然无副作用。
   */
  function expandOwningTurnProcess(root: Element): void {
    if (!DOC) return
    const turn = root.getAttribute('data-chat-turn')
    const selector = turn === null
      ? '[data-chat-flow-kind="turn-process"] button[data-turn-process][aria-expanded="false"]'
      : `[data-chat-flow-kind="turn-process"] button[data-turn-process="${CSS.escape(turn)}"][aria-expanded="false"]`
    for (const el of DOC.querySelectorAll<HTMLElement>(selector)) {
      if (isDisabled(el)) continue
      try {
        el.click()
      } catch (error) {
        console.warn('[dsh-tool-autoexpand] expand turn-process failed:', error)
      }
    }
  }

  /**
   * 折叠按钮选择器：过程组抬头与命令／工具活动按钮。
   *
   * next 把它们都做成 aria-expanded 开合状态，默认折叠。
   * 内层「… 其余 N 行」是真 button，不在选择器里，保持不动。
   */
  const COLLAPSED_SELECTOR = [
    'button[data-turn-process][aria-expanded="false"]',
    'button[data-process-activity][aria-expanded="false"]',
  ].join(',')

  /**
   * 逐层补扫的时间点。
   *
   * PTC 模式下代码卡片点开后，嵌套的工具调用行才会挂载，点开嵌套行后参数行才会挂载，
   * 一次点击展不开两层，所以在这些时间点各补一轮扫描。
   */
  const RETRY_DELAYS = [150, 400, 850]

  /** 展开 scope 内所有处于折叠态的过程组抬头与活动按钮。 */
  function expandCollapsedIn(scope: Element | Document): void {
    const targets: HTMLElement[] = []
    if (scope instanceof HTMLElement && scope.matches(COLLAPSED_SELECTOR)) {
      targets.push(scope)
    }
    for (const el of scope.querySelectorAll<HTMLElement>(COLLAPSED_SELECTOR)) {
      targets.push(el)
    }
    for (const el of targets) {
      if (isDisabled(el)) continue
      try {
        el.click()
      } catch (error) {
        console.warn('[dsh-tool-autoexpand] expand collapsed element failed:', error)
      }
    }
  }

  /**
   * 排一次延迟重试，触发后自动从待清理集合移除。
   * @param run 延迟执行的回调。
   * @param delayMs 延迟毫秒数。
   */
  function retryLater(run: () => void, delayMs: number): void {
    let dispose: () => void = () => {}
    dispose = timer.timeout(() => {
      retryDisposers.delete(dispose)
      run()
    }, delayMs)
    retryDisposers.add(dispose)
  }

  /** 展开后按固定间隔补几轮，等折叠行逐层渲染完成。 */
  function expandCollapsedInWithRetries(scope: Element): void {
    expandCollapsedIn(scope)
    for (const delay of RETRY_DELAYS) retryLater(() => expandCollapsedIn(scope), delay)
  }

  /**
   * 只展开工具调用卡片的顶层折叠行。
   * 顶层行是带 aria-expanded="false" 的非 <button> 元素：DisclosureRow 渲染 role=button 的 <div data-disclosure-row>，
   * bash 变体渲染 <div data-variant="bash" role="button">。
   * 内层「… 其余 N 行」/「收起」是真 <button>，跳过所有 <button> 就能让卡片的行数折叠保持原样。
   */
  function expandCard(root: Element): void {
    if (!(root instanceof HTMLElement)) return
    // 先点开外层的过程组，卡片才会从 hidden 状态现身。
    expandOwningTurnProcess(root)
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

  /** 展开后按固定间隔补几轮，等卡片内部的嵌套折叠行逐层渲染完成。 */
  function expandCardWithRetries(root: Element): void {
    expandCard(root)
    for (const delay of RETRY_DELAYS) retryLater(() => expandCard(root), delay)
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
    expandCollapsedIn(DOC)
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
    retryDisposers.clear()
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
      // 一次回调可能插入整棵子树，先归并节点再统一处理，避免同一张卡片被重复排队。
      const added = new Set<Element>()
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) added.add(node)
        }
      }
      if (added.size === 0) return
      const cards = new Set<Element>()
      for (const node of added) {
        expandCollapsedInWithRetries(node)
        if (node.matches('[data-chat-flow-kind="tool-call"]')) cards.add(node)
        for (const card of node.querySelectorAll('[data-chat-flow-kind="tool-call"]')) cards.add(card)
        // 嵌套的工具调用行在卡片内部后渲染，新增节点自身不是卡片，得向上找最近的卡片祖先。
        const owner = node.closest('[data-chat-flow-kind="tool-call"]')
        if (owner) cards.add(owner)
      }
      for (const card of cards) expandCardWithRetries(card)
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

  /** 侧栏底部的开关卡，点击在四档间循环；样式全部内联，不注入任何 CSS。 */
  function Toggle({ wide }: ToggleProps): ReactElement {
    const [mode, setMode] = useState<Mode>(state.mode)
    const [hovered, setHovered] = useState(false)
    const [pressed, setPressed] = useState(false)
    const [showHint, setShowHint] = useState(false)
    const ref = useRef<HTMLButtonElement | null>(null)
    const meta = MODE_META[mode]

    // 侧栏底部是行方向 flex 容器，本卡要占满整行，得把容器改成纵向排列。
    // 原先靠 CSS 的 :has() 选择器，这里直接改容器内联样式，卸载时还原。
    useEffect(() => {
      const el = ref.current
      if (!el) return
      const container = el.closest<HTMLElement>('[class*="footerActions"]')
      if (!container) return
      const previousDirection = container.style.flexDirection
      const previousAlign = container.style.alignItems
      container.style.flexDirection = 'column'
      container.style.alignItems = wide ? 'stretch' : 'center'
      return () => {
        container.style.flexDirection = previousDirection
        container.style.alignItems = previousAlign
      }
    }, [wide])

    const background = pressed
      ? 'var(--dsw-alias-interactive-bg-active)'
      : hovered
        ? 'var(--dsw-alias-interactive-bg-hover)'
        : 'transparent'

    const buttonStyle: CSSProperties = wide
      ? {
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          width: '100%',
          minWidth: 0,
          padding: '7px 9px 8px',
          border: `1px solid ${hovered ? 'var(--dsw-alias-border-l2)' : 'var(--dsw-alias-border-l1)'}`,
          borderRadius: '9px',
          background,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--dsw-alias-label-primary)',
          fontFamily: 'inherit',
          transition: 'background .12s ease,border-color .12s ease',
        }
      : {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          padding: 0,
          border: '1px solid transparent',
          borderRadius: '12px',
          background,
          cursor: 'pointer',
          color: 'var(--dsw-alias-label-primary)',
          fontFamily: 'inherit',
        }

    return (
      <button
        ref={ref}
        data-mode={String(mode)}
        type="button"
        title={meta.title}
        aria-label={meta.title}
        style={buttonStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false)
          setPressed(false)
        }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onClick={() => {
          const next = ((mode + 1) % 4) as Mode
          setMode(next)
          state.mode = next
          writeStoredMode(next)
          applyMode(next)
        }}
      >
        <span style={wide ? HEAD_STYLE : HEAD_COLLAPSED_STYLE}>
          <span style={ICON_STYLE} aria-hidden="true">
            <ToolExpandIcon />
          </span>
          {wide && <span style={TITLE_STYLE}>展开工具调用</span>}
          {wide && mode === 1 && (
            <span
              style={HINT_ICON_STYLE}
              role="button"
              tabIndex={0}
              title="轮次结束时 DSH 会收回展开，想常开请把展示模式切成「完全展开」"
              aria-label="展开说明"
              aria-expanded={showHint}
              onClick={(event) => {
                event.stopPropagation()
                setShowHint(value => !value)
              }}
            >?</span>
          )}
          {wide && <span style={PILL_STYLE}>{meta.pill}</span>}
        </span>
        {wide && <span style={DESC_STYLE}>{meta.desc}</span>}
        {wide && mode === 1 && showHint && (
          <span style={HINT_STYLE}>轮次结束时 DSH 会收回展开，想常开请把展示模式切成「完全展开」</span>
        )}
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
    applyMode(state.mode)
    return () => {
      stop()
    }
  })
}

/** 兼容旧产物的默认导出形态：同时提供命名导出与 default。 */
export default { name, inject, apply }
