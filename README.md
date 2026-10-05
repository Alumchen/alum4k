# Alum4K

影视资料与下载资源网站：TMDB 采集、影视分类、115 网盘链接、磁力链接、用户注册和 VIP 权限管理。网站不提供在线播放。

## 本地运行

需要 Node.js 20+。

```bash
npm ci
npm run dev
```

前台：`http://localhost:5173/`

独立后台：`http://localhost:5173/admin`

前台搜索框显示“搜索影视名”，延续精确匹配片名、原名或 TMDB ID。后台 TMDB 搜索支持模糊查询。

## 后台功能

后台只允许管理员登录，前台导航不显示后台入口。

- 媒体库：片名/ID 搜索、分类/资源筛选、分页、批量自动分类和批量删除。
- 影视采集：搜索 TMDB、导入详情、编辑资料、指定首页推荐、保存或更新 TMDB 元数据。
- 下载资源：115 网盘和磁力链接两个独立输入框，支持每行一条资源。详情页提供两种下载方式以及链接右侧的复制按钮。
- 用户/VIP：用户名和会员状态筛选，续期 30 天/90 天/1 年、永久 VIP、自定义到期日、取消 VIP。续期保留已有剩余天数。
- 站点设置：首页公告标题、正文、启停、显示频率以及预览。每次保存产生新公告版本，访客会重新看到更新后的公告。
- 媒体库 JSON 导入/导出：导入支持按影视 ID 或 TMDB ID 更新已有条目，最多 2000 项、10 MB。

未登录和非 VIP 用户可浏览影视信息，但接口不会返回下载地址或提取码。管理员和有效 VIP 可以查看链接。移除 VIP 菜单不会取消已有会员权限。

默认管理员用户名：`admin`。初始密码来自 `.env` 的 `ADMIN_PASSWORD`，开发默认值为 `admin123456`。首次启动后，账号存入 `data/users.json`；此后修改 `.env` 不会修改已有密码。

## 自动分类

TMDB 详情采集后，根据类型标签自动归类为电影、电视剧、综艺、动漫、少儿、纪录片。没有足够类型标签时，按电影/剧集区分。短剧、游戏等分类可关闭“自动分类”后手动指定。

媒体库中勾选条目并选择“自动分类”可重新分类已有影视。手动分类的条目保持原分类，除非主动执行批量自动分类。

## 配置

首次运行复制 `.env.example` 为 `.env`：

```dotenv
TMDB_BEARER_TOKEN=
TMDB_API_KEY=
API_PORT=5174
ADMIN_PASSWORD=设置管理员初始密码
AUTH_SECRET=随机长字符串
HTTPS_PROXY=
HTTP_PROXY=
```

TMDB 令牌和代理只在服务端使用。AList 不再参与播放，旧的 AList 路径不作为下载资源展示；有效的 115 分享链接和磁力链接会继续保留。

下载资源格式：

```text
115 网盘：https://115.com/s/分享码 | 提取码 | 大小 | 备注
磁力链接：magnet:?xt=urn:btih:完整哈希 | 大小 | 备注
```

每个条目最多 500 条资源。保存会校验链接类型并去重。

## Linux 部署

先安装 Node.js 20+，在可被 Nginx 读取的目录部署，例如 `/opt/alum4k`：

```bash
git clone https://github.com/Alumchen/alum4k.git /opt/alum4k
cd /opt/alum4k
cp .env.example .env
nano .env
sudo env SERVER_NAME="alum4k.com www.alum4k.com" bash scripts/deploy-linux.sh
```

脚本安装依赖、构建前端、创建 systemd 服务和 Nginx 配置，将 `/api/` 代理至本机 5174 端口。自定义首次部署端口：

```bash
sudo env WEB_PORT=8080 bash scripts/deploy-linux.sh
```

**已有 Nginx 和 systemd 配置会保留，包括 HTTPS 证书、域名及自定义端口。** 修改现有端口或域名应直接编辑 `/etc/nginx/sites-available/alum4k.conf` 并检查/重新加载 Nginx。后台 `/admin` 使用同一域名，不需要开放额外端口。

## 更新线上网站

在云服务器终端执行：

```bash
cd /opt/alum4k
sudo git pull --ff-only
sudo bash scripts/update-linux.sh
```

只有上一条命令成功后才执行下一条。如果 Git 提示本地修改冲突，先保留现场，不要使用强制重置。

更新脚本会在 `backups/时间戳/` 保存 `.env`、`data`、已有前端构建、Nginx 和 systemd 配置；构建成功后重启 API 并重新加载 Nginx，不重写现有证书配置。构建失败时恢复原前端文件，不重启后端。

更新脚本不会覆盖用户、VIP 和公告数据。备份目录权限为仅部署用户可访问，不会提交到 GitHub。请定期把备份另存到服务器之外。

常用命令：

```bash
sudo nginx -t
sudo systemctl status alum4k
sudo journalctl -u alum4k -f
sudo systemctl restart alum4k
```

## 验证

```bash
npm test
npm run build
npx playwright install chromium
npm run test:ui
```

接口测试使用临时目录，不修改实际媒体库和账号数据。界面测试验证独立后台登录、下载切换/复制、自动分类、公告、桌面和手机布局，截图保存到 `artifacts/ui/`。已安装 Edge 时可设置 `PLAYWRIGHT_CHANNEL=msedge`。

影视元数据和图片来源于 TMDB。本项目未获 TMDB 认可或认证。
