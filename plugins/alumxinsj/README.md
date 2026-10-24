# Alum芯世界

半导体工艺制造技术社区。前台 `/xinsj`，后台 `/xinsj/admin`，使用工作台现有账号与管理员权限。工作台模块管理可启用或停用，停用后后台仍可进入。

## 功能

- 分类：光刻、刻蚀、薄膜沉积、清洗湿法、离子注入与热处理、CMP、工艺整合、缺陷检测与良率、设备厂务和先进封装。管理员可修改分类；使用中的分类需先调整帖子后再删除。
- 文章、问答、视频和资料四类内容；搜索、分类筛选、最新/热门排序、每页12条、独立帖子地址。
- 现有账号登录后发帖、编辑自己的帖子、评论、点赞及收藏；“我的发布”可看审核状态和审核说明。
- 用户投稿和评论默认审核后公开；修改已发布帖子默认重新审核。管理员发布可直接公开。
- 后台管理帖子、审核说明、置顶、精华、关闭评论、删除，以及评论审核与删除、社区公告和公约、审核开关。
- 真实点赞、评论和作者统计，不生成虚构浏览量或用户。初始5篇为原创社区指南，不采集第三方文章。
- 视频和资料为外部链接，不存储视频或上传文件。正文为纯文本，不执行 HTML；图片和外部地址仅允许 HTTP/HTTPS。

## 数据与部署

数据独立保存在 `data/xinsj/forum.json`，写入前保留 `forum.json.bak`，使用串行原子写入和编辑冲突校验。目录不提交 Git，现有 Linux 更新流程会备份整个 data 目录，不覆盖社区内容。

JSON 导出包含完整社区管理数据（包括审核内容和互动账号），只供管理员备份，不要公开分享。当前不提供在线 JSON 恢复入口，恢复需停服务后从受信备份替换数据文件。

更新：`cd /opt/alum4k && sudo git pull --ff-only && sudo bash scripts/update-linux.sh`。更新会增加 `/xinsj` 相关 Nginx 代理规则，保留已有域名、端口和 HTTPS。

## 素材与参考

布局参考技术邻的专题列表和侧栏结构，不复制其文章、商标或课程内容：<https://www.jishulink.com/major/semiconductor>。

横幅照片：NASA Glenn Research Center，GRC-1998-C-01261，Wikimedia Commons《Clean room.jpg》，公共领域。原图：<https://commons.wikimedia.org/wiki/File:Clean_room.jpg>。照片仅用于展示洁净室环境，不代表该机构与本站存在关联。

## 验证

`npm test`、`npm run test:xinsj`、`npm run test:production`。界面测试需 Playwright Chromium 或设置 `PLAYWRIGHT_CHANNEL=msedge`，截图在 `artifacts/ui/`。测试使用临时数据，不接触实际账号和社区数据。
