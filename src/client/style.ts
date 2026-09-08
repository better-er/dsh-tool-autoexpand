/**
 * 侧栏底部开关的样式。
 *
 * 开关是一张「小卡片」——清晰的标题加描述行，再加一个分段胶囊开关，一眼就能看懂用途。
 * 颜色跟随 dsh 主题别名 token，因而明暗主题都能自然融入；除此之外本插件不改动任何全局主题。
 */

/** 用 data-plugin 属性标识本插件的 style 标签，HMR 时能可靠地在 DOM 中定位自己。 */
export const STYLE_PLUGIN_ATTR = 'dsh-tool-autoexpand'

const TOGGLE_CSS: string = [
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
  // sidebar footer action 是行方向 flex 容器，多个插件按钮会被左右挤压；容器内含本插件开关时转纵向排列
  '[class*="footerActions"]:has(button.dshe-toolx-toggle){flex-direction:column;align-items:stretch}',
  // 侧栏收起时依据 frame 根节点的 data-sidebar-collapsed 属性切换单图标模式。
  // 隐藏标题/描述/ON-OFF 胶囊，按钮收成 36x36 图标方块，避免溢出窄 rail。
  // 尺寸与边缘样式对齐 DSH 原生「新建会话」图标按钮，36x36、radius 12px、透明边框。
  // 本按钮是开关，开启状态下额外呈现 hover 背景作为状态提示。
  // 收起态 specificity 高于 :hover，故开启时背景常驻、视觉等同悬停，无绿色描边。
  // 收起态禁用 transition，否则 data-mode 切换时的 background 过渡会卡滞在 hover 色上，关闭状态背景无法回到 transparent。
  '[data-sidebar-collapsed] [class*="footerActions"]:has(button.dshe-toolx-toggle){align-items:center}',
  '[data-sidebar-collapsed] button.dshe-toolx-toggle{width:36px;height:36px;padding:0;align-items:center;justify-content:center;border-radius:12px;border-color:transparent;transition:none}',
  '[data-sidebar-collapsed] .dshe-toolx-title,[data-sidebar-collapsed] .dshe-toolx-desc,[data-sidebar-collapsed] .dshe-toolx-pill{display:none}',
  '[data-sidebar-collapsed] .dshe-toolx-head{gap:0}',
  // 收起态同一图标：三态平等，统一用常规前景色，不再为某档高亮。
].join('')

/**
 * 确保页面里存在本插件的样式标签，已存在同名 data-plugin 标签则复用并刷新内容。
 * @param doc 宿主文档。
 * @returns 当前生效的 style 标签，供卸载时移除。
 */
export function ensureStyle(doc: Document): HTMLStyleElement {
  const existing = doc.querySelector<HTMLStyleElement>(`style[data-plugin="${STYLE_PLUGIN_ATTR}"]`)
  if (existing) {
    existing.textContent = TOGGLE_CSS
    return existing
  }
  const tag = doc.createElement('style')
  tag.dataset.plugin = STYLE_PLUGIN_ATTR
  tag.textContent = TOGGLE_CSS
  doc.head.appendChild(tag)
  return tag
}

/**
 * 移除本插件的样式标签，同时按闭包引用和 data-plugin 属性查找，防止遗漏。
 * @param doc 宿主文档。
 * @param tag 卸载时持有的标签引用，可能已脱离 DOM。
 */
export function removeStyle(doc: Document, tag: HTMLStyleElement | null): void {
  let target = tag
  if (!target || !target.parentNode) target = doc.querySelector<HTMLStyleElement>(`style[data-plugin="${STYLE_PLUGIN_ATTR}"]`)
  if (target && target.parentNode) target.parentNode.removeChild(target)
}
