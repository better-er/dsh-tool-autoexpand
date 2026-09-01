# dsh·工具结果自动展开插件

自动展开 DSH 浏览器界面里随后新到达的工具调用卡片，并在侧栏底部提供**四态逻辑 + 三态 UI** 的开关：在「不干预 / 展开 / 折叠」三态间循环切换，默认展开。

纯浏览器端 client 插件，不替换任何原生工具卡片渲染器。

![插件开关](docs/插件开关.webp)

## 引言

DeepSeek Harness 的工具调用，默认和 CloseAI 一样是**收着**的——结果全都藏在折叠里不给你看。可这哪符合开源精神？**Open**！所有的工具调用结果，就该统统打开。

于是祥云做了这个插件，专门帮你把 DeepSeek Harness 自动**开源**掉——新到达的工具调用结果全部自动展开。不想看了？把开关切到「折叠」，已经摊开的卡片立刻全部收回去，清爽如初；想回到默认，再点一下回到「不干预」就好。

当然，为了避免无意义的刷屏，这个「打开」是**短打开模式**：只执行一级展开，而不会把那些修改行统统二级展开。既能看到结论，又不糊一脸改动细节。

这样，你就能**爽爽监工 DeepSeek Harness**——它每一步在背后做了什么，都摊开在你眼皮子底下，清清楚楚。

却没想到，这狡猾的**蓝色大肥鱼**，就在你眼皮子底下偷偷啃着你的 Token——拿着你的钱上网玩儿去了。

![DSH 偷吃图](docs/偷吃图.webp)

## 功能

- 侧栏底部开关卡，采用**四态逻辑 + 三态 UI**：逻辑上在「0 不干预 → 1 展开 → 2 不干预 → 3 折叠」四档间循环，界面上只呈现「不干预 / 展开 / 折叠」三种外观，其中两个「不干预」档显示为同一种样子，点击一次切换一档。
  - **展开**：自动展开新渲染的工具调用卡片，并立刻展开页面上已存在的工具卡片。
  - **折叠**：立刻折叠页面上所有已展开的工具卡片，并让新到达的卡片保持收着。
  - **不干预**：停止自动处理，新到达的卡片保持默认收着，不主动动已有卡片。
- 只展开或折叠卡片**顶层**折叠行，**不会**误开内部 ReadBlock / TerminalBlock / DiffBlock / SearchBlock 的行数折叠。
- 开关档位持久化到 localStorage，刷新后保持；兼容旧版「开/关」的存储数据，旧「开」→ 展开，旧「关」→ 不干预。
- 开关卡随 DSH 明/暗主题自适应，切换即生效，无需重启。

## 效果

新到达的工具调用卡片自动展开后的实际效果：

![dsh-tool-autoexpand](docs/展开效果.webp)

## 演示视频

光看静态截图不过瘾？两位同好分别给这个插件拍了演示视频，还在标题上互相点名对方，欢迎点开对比观看：

| 祥云版 · 34 秒 | dpsk 版 · 23 秒 |
| :---: | :---: |
| [![祥云版演示视频](https://i0.hdslb.com/bfs/archive/34370974cb39f14c42ae45d5ea054cd7efc50d72.jpg)](https://www.bilibili.com/video/BV1S4b16pEnB/) | [![dpsk 版演示视频](https://i0.hdslb.com/bfs/archive/00cf79289741dedb9208107d59b0430aec1149ff.jpg)](https://www.bilibili.com/video/BV1Mhb16DEYH/) |

## 安装

```powershell
dsh plugin --profile web add github:better-er/dsh-tool-autoexpand
```

或安装 npm 发布的版本：`dsh plugin --profile web add dsh-tool-autoexpand`。

一条命令装完即生效，自动挂载，重启 DSH web 后启用，无需手工编辑任何组合文件。

## 卸载

```powershell
dsh plugin --profile web remove dsh-tool-autoexpand
```

彻底移除，重启 DSH web 后不再加载。

## 要求与开发

- 是**标准形态的 dsh client 插件**，声明 `dsh.client`，导出 `./client`。
- 同时声明了 `dsh.bundle`，因此也是一个**自挂载的 bundle 层插件**：用 `dsh plugin --profile <name> add` 从 GitHub 安装后，会被自动识别为 profile layer 并挂载，无需手工写组合 entry。
- 纯浏览器半身，无 host 行为。
- 无构建：`lib/client.js` 是按 DSH client bundle 产出的注册式模块，源码即产物。

## License

[MIT](./LICENSE)
