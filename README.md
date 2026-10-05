# Alum4K

一个类似腾讯视频的信息流式影视站雏形：前台展示影视分类、搜索和详情页；服务端代理 TMDB 元数据；后台可添加 115 网盘资源、磁力链接，并管理注册用户的 VIP 权限。

首页包含精选推荐、分类筛选、资源状态标签和内容统计；详情页包含在线播放/下载资源概览、选集播放和同类推荐。

前台顶部搜索栏为精确搜索：只匹配本地媒体库中的准确片名、原名或 TMDB ID；后台 `TMDB 采集` 搜索仍保留 TMDB 模糊搜索，方便采集新条目。

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`。

## Linux 一键部署

服务器需要先安装 Node.js 20+。在项目目录执行：

```bash
bash scripts/deploy-linux.sh
```

脚本会自动执行：

- 安装 npm 依赖并构建前端 `dist`
- 创建 systemd 服务 `alum4k`，用于运行后端 API
- 安装或使用 Nginx，站点根目录指向 `dist`
- 将 `/api/` 反向代理到 `127.0.0.1:5174`

可选环境变量：

```bash
APP_NAME=alum4k API_PORT=5174 WEB_PORT=80 bash scripts/deploy-linux.sh
```

常用管理命令：

```bash
sudo systemctl status alum4k
sudo journalctl -u alum4k -f
sudo systemctl restart alum4k
```

## 账号和后台

前台用户可以自行注册，但注册后默认不是 VIP。后台入口不会显示在主页左侧导航中，只有管理员登录后，顶部操作区才会出现 `后台管理`。

默认管理员：

```text
用户名：admin
默认密码：admin123456
```

可在 `.env` 中用 `ADMIN_PASSWORD` 修改初始管理员密码。首次启动会创建 `data/users.json`，之后修改 `.env` 不会覆盖已经创建的 admin 密码。

## VIP 权限

- 非 VIP 用户：可以浏览影视信息，但不能查看 115 网盘链接、磁力链接，也不能在线播放。
- VIP 用户：可以查看 115 网盘链接、磁力下载链接，并使用在线播放。VIP 支持永久会员或指定到期日，到期后会自动失去资源查看和在线播放权限。
- 管理员：登录 admin 后进入后台，在 `用户 / VIP` 区域可给已注册用户开通 `30天`、`90天`、`1年`、`永久` VIP，也可以手动选择到期日或取消 VIP。

## TMDB 采集

复制 `.env.example` 为 `.env`，填写 `TMDB_BEARER_TOKEN` 或 `TMDB_API_KEY`。推荐使用 TMDB 的 API 访问令牌，密钥只在服务端使用，浏览器不会看到。

后台 `TMDB 采集` 中输入片名搜索，点结果载入详情；补充分类、资费、状态、演员、海报、简介和资源后，点击 `保存` 或 `采集并保存`。

## 115 / 磁力资源

后台 `下载资源` 分成三个输入框：

```text
AList 路径：/115网盘/电影/片名/片名.mp4
115 网盘链接：https://115.com/s/xxxx | 提取码 | 4K/20GB | 备注
磁力链接：magnet:?xt=urn:btih:... | 大小 | 备注
```

详情页简介下方会显示 `立即播放` 按钮。在线播放不会直接打开 115 分享链接，而是请求后端 `/api/watch/...`，由服务端通过 AList/OpenList 解析 115 文件路径后播放。

## AList/OpenList 配置

要让 VIP 在线观看生效，需要先把 115 挂载到 AList/OpenList，然后在 `.env` 配置：

```text
ALIST_BASE_URL=http://127.0.0.1:5244
ALIST_TOKEN=
```

后台用于在线播放的 115 资源地址请填写 AList 文件路径，例如 `/电影/片名.mkv`。普通 `https://115.com/s/...` 分享链接会保留为 VIP 下载入口，但不会被当作在线播放地址。

后台资源区内置 `AList 文件选择器`：输入目录路径后点击 `打开目录`，可以浏览 AList 目录；点击视频文件会自动加入 `AList 路径` 输入框；点击 `批量导入` 会把当前目录下的全部视频文件一次性加入，并按多条 AList 路径生成多集/多资源播放入口。前台详情页会为多条 AList 播放资源显示选集按钮。

> 请只播放你有权访问的个人网盘内容，不要把 115 源当作公开盗链分发。
