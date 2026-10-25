# AlumAI · 个人远程浏览器

前台 `/ai`，后台 `/ai/admin`。这是用户明确选择的远程浏览器方案，不是 OpenAI API 对话代理，不使用 ChatGPT Cookie 转发、共享 ChatGPT 账号、自动登录、自动解验证码或网页回答抓取。

服务器运行 Chromium，前台通过 noVNC 接收画面和发送键鼠。用户亲自在远程网页中登录自己的 AI 网站并提问，回复也在远程网页中显示。网站可否访问和登录取决于服务器所在地区、网络、服务商规则和账号状态；本插件不绕过这些限制。

## 首次安装

需要 Ubuntu/Debian、systemd、Node.js 20+、至少4 GB内存和足够磁盘（建议空闲10 GB以上），且能下载 Docker 镜像和访问目标 AI 网站。首次下载镜像和中文字体需要较长时间。

```bash
cd /opt/alum4k
sudo git pull --ff-only
sudo bash scripts/update-linux.sh
sudo bash scripts/setup-ai-linux.sh
```

安装脚本会在缺少 Docker 时通过 apt 安装 docker.io，构建 `alumai-browser:1`，创建只监听 `127.0.0.1:5188` 的 `alumai-runtime` 服务，生成本地服务凭据并写入现有 `.env`。修改前备份 `.env`，不在终端打印凭据。不会修改网站的1023端口、域名或HTTPS设置。

浏览器组件是独立的、受限指令集的本机运行服务，网站进程不需要加入 docker 用户组或获得 Docker socket。根服务代码安装至 root 私有的 `/opt/alumai-runtime/`，不直接以 root 运行可由网站进程修改的仓库脚本。Docker 镜像有更新时重新运行安装脚本，运行组件源码变更后也需要重新运行该脚本；普通网站更新不自动重建镜像或重启运行组件。

从 `/ai/admin` 检查组件状态、添加AI工具网址、调整排序/启用状态和授权可信账号。管理员默认可用，其他网站注册用户默认没有远程浏览器权限，只能授权已存在的用户名。默认提供ChatGPT、Claude、Gemini、DeepSeek网站入口，不代表这些网站会允许服务器所在地区的访问。

## 资源和会话

- 默认同时运行1个个人浏览器。根管理员可在 `/etc/alumai/runtime.env` 修改 `ALUMAI_MAX_BROWSERS=1`（1到10），根据资源量增加，之后重启 `alumai-runtime`。
- 每个浏览器限制2 GB内存、1.5 CPU、512个进程和512 MB共享内存。不是每个AI工具都起一个浏览器：同一网站账号的不同工具在本人浏览器中打开新标签页。
- 页面可调整远程显示尺寸、全屏、发送回车和手动双向剪贴板。中文文本通过本人容器内的UTF-8 xclip传输，不依赖VNC的传统Latin-1剪贴板；不会自动读取本机或远程剪贴板。只有点击操作才读写，应用不保存文本、不放入Docker命令参数。
- 新浏览器资料默认关闭密码保存提示，登录Cookie仍可能保存在本人资料卷。默认下载路径在资料卷中，若在远程浏览器里自行改到其他路径，相应文件可能随容器关闭而丢失。
- 页面可见时每20秒续租；后台/休眠超过90秒时连接可能失效，重新打开即可。浏览器最后续租15分钟后回收，个人资料卷保留。
- 关闭个人浏览器会尝试正常终止Chromium，再停止容器；不会清除网站登录。清除个人浏览器数据操作会删除本人资料卷，并退出该浏览器的全部网站。
- 服务/网站重启后旧的远程连接失效；运行组件会清理遗留的受管容器，不删除资料卷。

## 数据与安全边界

工具和授权设置在 `data/ai/settings.json`（带原子写入、修订冲突检测和 `.bak`）。凭据在 `.env`、`/etc/alumai/runtime.env`。浏览器登录、历史和下载文件在Docker卷 `alumai-profile-<账号哈希>`，这些均不得提交Git或公开分享。浏览器凭据不保证磁盘加密，主机管理员应保护磁盘、备份和Docker权限。

普通站点更新会备份data和.env，**不会备份Docker资料卷**。迁移登录状态需由主机管理员在浏览器停止后，单独以私有方式备份资料卷；浏览器厂商或AI网站也可能使迁移后的登录失效。

远程连接以短期、HttpOnly、SameSite=Strict Cookie验证，HTTPS下增加Secure；WebSocket还校验同源、当前网站权限及账号会话。上游VNC不会收到网站JWT或Cookie。连接票据不会永久保存在浏览器本地；每个账号拥有独立Docker容器和资料卷。

VNC只绑定服务器回环地址，无VNC自身密码，必须经网站鉴权后访问。**不要在防火墙放行5188、4444、5900或7900等管理端口，也不要把回环VNC端口反代为免登录入口。** 只通过已有HTTPS网站访问远程画面；生产环境不建议使用明文HTTP。

容器没有privileged、Docker socket或主机目录挂载，移除所有Linux capabilities并限制资源。容器内Chromium以非root用户运行，但带 `--no-sandbox`，因此Docker是主要隔离边界，**不构成强多租户沙箱**。浏览器可主动浏览服务器可访问的网络；入口网址的公开HTTPS校验不是完整的网络出口隔离。默认仅管理员使用，仅授权完全可信的人，不要开放给陌生注册用户，建议使用专门的无敏感内网访问能力的浏览器主机。无下载磁盘配额，需监控磁盘空间。

## 排错与更新

```bash
sudo systemctl status alumai-runtime --no-pager
sudo journalctl -u alumai-runtime -n 80 --no-pager
sudo docker ps --filter label=alumai.managed=1
```

有画面但目标网站打不开，先检查服务器网络和该网站的服务地区；出现登录校验则由本人在远程窗口完成，不提供自动绕过。不要上传包含登录信息的截图或日志。

如果默认镜像无法下载或需升级，主机管理员可用 `ALUMAI_BASE_IMAGE` 指定经审查的 Selenium standalone-chromium 标签，再运行安装脚本。首次版本固定到已查询Docker Registry可用的 `155.0-chromedriver-155.0-grid-4.50.0-20261010`，不在运行时自动拉取陌生镜像。

## 验证与来源

`npm test`、`npm run test:ai`、`npm run test:production`。自动化测试使用独立临时目录和确定性的RFB测试桌面，验证会话权限、同源Cookie保护、画面非空、键盘、剪贴板控制、后台CRUD和正式构建，不使用真实ChatGPT账号、不声称已完成真实Docker浏览器或第三方登录验收。

- 浏览器基础镜像：[Selenium Docker](https://github.com/SeleniumHQ/docker-selenium)。通过普通浏览器命令打开网页，不创建WebDriver会话，不修改自动化检测或指纹。
- noVNC：[v1.5.0源代码与MPL-2.0许可](https://github.com/novnc/noVNC/tree/v1.5.0)。未修改其源代码。当前固定1.5.0，因为1.6.0的npm CommonJS发行包含不兼容当前构建工具的顶层await。
- [noVNC RFB API](https://github.com/novnc/noVNC/blob/master/docs/API.md)。
- [http-proxy](https://github.com/http-party/node-http-proxy)，MIT许可。
