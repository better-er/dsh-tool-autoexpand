# dsh·工具结果自动展开插件

自动展开 DSH 浏览器界面里随后新到达的工具调用卡片，并在侧栏底部提供一个一目了然的自定义开关（默认开）。

纯浏览器端（client）插件，不替换任何原生工具卡片渲染器。

侧栏底部的插件开关（默认开）：

![插件开关](docs/插件开关.png)

## 引言

DeepSeek Harness 的工具调用，默认和 CloseAI 一样是**收着**的——结果全都藏在折叠里不给你看。可这哪符合开源精神？**Open**！所有的工具调用结果，就该统统打开。

于是祥云做了这个插件，专门帮你把 DeepSeek Harness 自动**开源**掉——新到达的工具调用结果全部自动展开。

当然，为了避免无意义的刷屏，这个「打开」是**短打开模式**：只执行一级展开，而不会把那些修改行统统二级展开。既能看到结论，又不糊一脸改动细节。

这样，你就能**爽爽监工 DeepSeek Harness**——它每一步在背后做了什么，都摊开在你眼皮子底下，清清楚楚。

却没想到，这狡猾的**蓝色大肥鱼**，就在你眼皮子底下偷偷啃着你的 Token——拿着你的钱上网玩儿去了（上图 DSH 偷吃图）：

![DSH 偷吃图](docs/偷吃图.png)

## 功能

- 自动展开新渲染的工具调用卡片。
- 只展开卡片**顶层**折叠行，**不会**误开内部 ReadBlock / TerminalBlock / DiffBlock / SearchBlock 的行数折叠。
- 侧栏底部开关卡：图标 + 标题 + ON/OFF 状态胶囊 + 一句效果说明，随 DSH 明/暗主题自适应。
- **侧栏收起自适应**：DSH 侧栏收成窄 rail 时开关自动收成 36×36 单图标方块（隐藏标题/描述/胶囊），尺寸与圆角对齐 DSH 原生「新建会话」图标按钮，展开侧栏即恢复完整卡片。
- **收起态 ico**：单色内联 SVG（16×16、`fill="currentColor"`）——三条内容行 + 向下展开箭头，与 DSH 原生图标风格一致；**同一图标、颜色区分开关**——开启显示品牌蓝 + 浅灰底，关闭为常规前景色 + 透明底，窄 rail 下也能一眼看出开关状态。
- 整卡可点击，`aria-pressed` 同步状态；切换即启用/停用，无需重启。

## 效果

新到达的工具调用卡片自动展开后的实际效果：

![dsh-tool-autoexpand](docs/展开效果.png)

## 演示视频

光看静态截图不过瘾？两位同好分别给这个插件拍了演示视频，还在标题上互相点名对方，欢迎点开对比观看：

| 祥云版（34 秒） | dpsk 版（23 秒） |
| :---: | :---: |
| [![祥云版演示视频](https://i0.hdslb.com/bfs/archive/34370974cb39f14c42ae45d5ea054cd7efc50d72.jpg)](https://www.bilibili.com/video/BV1S4b16pEnB/) | [![dpsk 版演示视频](https://i0.hdslb.com/bfs/archive/00cf79289741dedb9208107d59b0430aec1149ff.jpg)](https://www.bilibili.com/video/BV1Mhb16DEYH/) |

## 要求

- 是**标准形态的 dsh client 插件**（声明 `dsh.client`、导出 `./client`）。
- 同时声明了 `dsh.bundle`，因此也是一个**自挂载的 bundle 层插件**：用 `dsh plugin --profile <name> add` 从 GitHub 安装后，会被自动识别为 profile layer 并挂载，无需手工写组合 entry。
- 纯浏览器半身，无 host（node）行为。

## 安装

```powershell
dsh plugin --profile web add github:better-er/dsh-tool-autoexpand
```

一条命令装完即生效（自动挂载，重启 DSH web 后启用），无需手工编辑任何组合文件。

## 卸载

```powershell
dsh plugin --profile web remove dsh-tool-autoexpand
```

彻底移除，重启 DSH web 后不再加载。

## 构建与原理

- **无构建**：`lib/client.js`（`dsh.client.platform: "web"`、`exports["./client"] → ./lib/client.js`）是按 DSH client bundle 产出的注册式模块，源码即产物。
- **展开原理**：监听会话容器捕获新渲染的 `[data-chat-flow-kind="tool-call"]` 节点，只点击**非 `<button>`** 的 `[aria-expanded="false"]` 折叠行，不误开内部行数折叠；侧栏开关经 `sidebar.footer.action` 插槽注入。
- **硬性约束**：`lib/client.js` 的 `factory` 必须以 `return module.exports` 结尾，否则模块导出为 `undefined`，DSH 启动即 fail-loud。

## License

[MIT](./LICENSE)
