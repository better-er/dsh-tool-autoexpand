/**
 * Node 半身：一个空操作的 Cordis 插件。全部行为都在浏览器半身，
 * 由 web 客户端模块系统通过 package.json 的 dsh.client 声明发现。
 * 这一半存在的意义是让插件根成为一个完整的双面包，在宿主 Loader 里只占一条条目，
 * 并借 dsh.bundle 成为自挂载的 bundle 层。
 */
/** 插件名，同时也是配置项 id。 */
export const name = 'dsh-tool-autoexpand'
/** 不使用任何宿主侧服务。 */
export const inject: string[] = []
/** 浏览器表面插件，宿主侧无行为。 */
export function apply(): void {}
