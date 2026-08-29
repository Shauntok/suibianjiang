# 有效阅读统计设计

日期：2026-08-29

状态：待项目负责人最终审阅

## 目标

为共用 `posts` 表的文章与日记增加可信、节制且可长期保留的有效阅读统计。

统计结果默认不在任何居民或访客页面显示。Owner 与 Admin 在现有 `/admin/content` 内容卡片中查看每篇作品的精确累计阅读数。数据同时保留每日汇总，为后续合作商报表提供总量、月度和季度统计基础。

本阶段不增加新的后台页面，不公开阅读数，不保存 IP、设备型号或永久阅读轨迹。

## 统计口径

一次有效阅读必须同时满足：

1. 内容属于 `posts.type in ('article', 'diary')`。
2. 内容为 `status = 'published'`、`visibility = 'public'`，且 `deleted_at is null`。
3. 页面在可见、前台状态累计停留满 10 秒。
4. 阅读者不是作品作者。
5. 同一阅读者对同一作品距离上一次计数已满 12 小时。

页面切换到后台、切换标签页或锁屏时暂停累计。单次页面挂载只提交一次统计请求，因此连续停留数小时不会循环增加。12 小时后仍需离开并重新进入作品页面、重新满足 10 秒前台停留，才可能产生下一次有效阅读。

统计范围包括登录居民与未登录访客。该指标名称固定为“有效阅读次数”，不是独立访客人数。同一人在不同时段满足 12 小时规则后可以贡献多次有效阅读。

## 展示设计

不创建新的 Admin 导航或页面。在 `/admin/content` 每张现有内容卡片的顶部右侧显示：

```text
[Eye icon] 12,438 次有效阅读
```

规则：

- 使用 Lucide `Eye` 图标。
- 后台始终使用 `zh-CN` 千位分隔格式显示完整整数，不缩写为“1.2万”。
- 没有阅读时显示 `0 次有效阅读`。
- 桌面端位于标签行右上角；较窄视口允许自然换到独立一行，不与类型、状态、可见性及 ID 标签重叠。
- 读取失败时显示“阅读数据暂不可用”，不得把失败误显示成 0。
- 现有搜索、筛选、可见性操作、回收站操作和“后台全文”入口保持不变。

公开文章、公开日记、居民房间和各广场均不渲染阅读数。当前阶段不增加公开开关；“默认关闭”通过完全不存在公开展示来实现。未来公开展示属于独立功能，需另行审批。

## 数据模型

统计数据不放入 `posts`，避免现有公开 `posts` 查询意外暴露阅读数。使用三个职责单一的统计结构：

### `private.post_view_stats`

每篇作品最多一行，保存长期累计值。

- `post_id bigint primary key references public.posts(id) on delete cascade`
- `view_count bigint not null default 0 check (view_count >= 0)`
- `updated_at timestamptz not null default now()`

### `private.post_view_daily`

每篇作品每天最多一行，保存马来西亚自然日汇总。

- `post_id bigint references public.posts(id) on delete cascade`
- `view_date date not null`
- `view_count bigint not null default 0 check (view_count >= 0)`
- `updated_at timestamptz not null default now()`
- 主键：`(post_id, view_date)`

`view_date` 使用 `Asia/Kuala_Lumpur` 计算，不依赖访问者设备时区。

### `private.post_view_dedupe`

短期防重复记录，不保存可直接识别的居民 ID、Cookie 原值或 IP。

- `post_id bigint references public.posts(id) on delete cascade`
- `viewer_hash text not null`
- `last_counted_at timestamptz not null`
- 主键：`(post_id, viewer_hash)`
- 清理索引：`last_counted_at`

登录居民使用服务器端密钥对稳定的用户标识生成 HMAC 摘要。匿名访客使用服务器签发的随机 `HttpOnly`、`Secure`、`SameSite=Lax` Cookie，再由服务器生成 HMAC 摘要。数据库不保存原始身份值。

现有作品在 migration 应用时可初始化 `post_view_stats = 0`。不推测或回填部署前的历史阅读量；对合作商展示时必须注明统计起始日期。

## 写入流程

文章与日记共用一个轻量客户端组件。组件只在明确符合公开、已发布条件时启动，不改变文章 `/articles/[slug]` 和日记 `/diary/[id]` 路由。

1. 组件监听 `document.visibilityState`。
2. 只累计页面可见期间的时间。
3. 累计达到 10 秒后，以 `fetch(..., { keepalive: true })` 向同源统计端点提交一次 `post_id`。
4. 端点读取登录 Session；没有 Session 时读取或签发匿名 Cookie。
5. 端点不信任客户端传入的作者、状态、可见性、计时结果或阅读数。
6. 端点调用仅授权 `service_role` 的数据库函数。
7. 数据库函数重新读取 `posts`，验证内容资格并排除作者。
8. 数据库原子更新防重复记录；只有首次记录或距离上次满 12 小时的请求获得计数资格。
9. 获得资格后，在同一事务中分别 upsert 累计值和 MYT 当日值。

数据库函数必须通过唯一约束和条件更新处理并发。同一阅读者在多个标签页同时请求时，只允许一个事务增加计数。

统计请求失败不影响阅读页面，不向居民弹出错误通知，也不进行无限重试。重新进入页面后可再次尝试；数据库去重保证成功过的请求不会因重试重复增加。

## 权限与接口

统计表位于未暴露的 `private` schema，不向 `anon`、`authenticated` 或浏览器角色授予表权限。

数据库写入函数和后台读取函数：

- 从 `PUBLIC` 撤销默认 `EXECUTE`。
- 仅授权 `service_role`。
- 固定安全的 `search_path`。
- 校验所有输入。
- 不接受客户端提供的增量值。

公开统计端点只接受单个合法 `post_id`，执行限长 JSON 解析，并由服务器生成 `viewer_hash`。它返回通用成功结果，不向访问者泄露累计数、是否命中冷却或内部身份摘要。

后台阅读数接口先使用当前用户 Session 验证身份，再检查 `profiles.role in ('owner', 'admin')`。Moderator 和普通用户不得读取。验证通过后，服务器使用 `service_role` 调用只读统计函数，并只返回请求页面所需的 `post_id` 与 `view_count`。

`/admin/content` 保留现有内容读取和操作流程，只追加一次批量统计读取。不得为列表中的每张卡片分别发送请求，避免 N+1 查询。

匿名 Cookie 使用单独的服务器密钥，例如 `VIEWER_ID_SECRET`。该变量只存在于服务器环境，不使用 `NEXT_PUBLIC_` 前缀，不复用 Supabase `service_role` 作为业务签名密钥。缺少密钥时统计端点安全失败，不降级为存储 IP 或可伪造的明文身份。

清除 Cookie、换浏览器或换设备仍可能形成新的匿名身份。这是无账号匿名统计的已知限制。本阶段不采用浏览器指纹或 IP 追踪来提高准确率。

## 自动清理

Supabase Cron 每天执行一次 SQL 清理，只删除 `private.post_view_dedupe` 中超过 24 小时未更新的记录。12 小时资格由写入函数实时判断，24 小时保留窗口为调度延迟留下余量。

清理不会修改 `post_view_stats` 或 `post_view_daily`，因此累计和每日历史不会丢失。Cron 任务必须使用固定名称，migration 回滚时可明确移除，避免重复调度。

每日汇总每篇活跃作品每天最多一行；防重复表只保留近期活跃阅读者。系统不创建永久逐次浏览日志，因此数据库增长主要取决于“活跃作品天数”，而不是总页面访问次数。

## 合作数据口径

后台卡片显示每篇作品自统计上线日起的精确累计有效阅读次数。`post_view_daily` 支持未来按日期范围汇总：

- 全站有效阅读次数。
- 文章与日记分别的有效阅读次数。
- 单篇作品在指定月份或活动期间的有效阅读次数。

任何对外材料必须同时说明：统计起始日期、10 秒有效停留规则、12 小时同作品去重规则，以及该指标不是独立人数。这样比只展示缩写数字更可核对，也避免把有效阅读误称为独立访客。

本阶段不建设合作商报表、CSV 导出、图表或公开 Analytics 页面。

## 兼容与 migration

数据库修改必须通过新的向后兼容 migration 完成：

- 不修改或清空 `posts`。
- 不改文章、日记路由。
- 不创建 `articles` 或 `diaries` 表。
- 不回写虚构历史阅读数。
- migration 应用前现有页面行为不变。
- migration 应用后若统计接口暂未部署，作品页面仍可正常阅读，后台只显示统计读取错误状态。

部署顺序为：环境密钥准备、数据库 migration、应用部署、生产烟雾测试。正式启用前需确认 Cron 已创建且函数权限正确。

## 测试与验收

### 前端测试

- 9 秒不提交，累计满 10 秒提交一次。
- 页面隐藏期间不累计时间，恢复后继续累计。
- 卸载组件后清除计时器和事件监听。
- 单次挂载只提交一次，长时间停留不循环提交。
- 草稿、私密、隐藏、链接可见和已删除内容不启动追踪。
- Admin 卡片显示精确千位分隔数字、0 和读取失败状态。
- 窄屏统计标签不与现有标签重叠。

### API 测试

- 拒绝无效、缺失或超范围 `post_id`。
- 登录居民与匿名访客都可提交合格请求。
- 匿名 Cookie 属性正确，端点不回传身份摘要和统计数。
- 缺少服务器密钥时安全失败。
- 普通用户与 Moderator 不能读取后台统计。
- Owner/Admin 批量读取成功，且不产生 N+1 请求。

### 数据库 pgTAP

- 首次有效阅读同时增加累计值和 MYT 当日值。
- 12 小时内重复请求不增加。
- 满 12 小时后再次进入可增加。
- 作者不增加。
- 非公开、未发布或已删除作品不增加。
- 并发相同身份请求只增加一次。
- 不同身份可以分别增加。
- 日期跨 MYT 午夜后写入正确日期。
- 清理仅删除过期防重复记录，不影响累计与每日数据。
- `anon`、`authenticated`、普通用户和 Moderator 无权直接读取或写入统计表与函数。

### 最终门禁

- 全部 Vitest 通过。
- 统计 pgTAP 全部通过并在事务回滚后无残留测试数据。
- focused ESLint 无新增问题。
- production build 通过。
- Supabase advisors 检查新对象的 RLS、函数权限、索引与外键。
- `/admin/content` 桌面与手机截图检查无重叠或横向溢出。
- 生产环境以作者、其他居民和匿名访客完成 10 秒、12 小时冷却与后台精确数字烟雾测试。

## 本阶段不包含

- 公开阅读数。
- 阅读排行榜或热门算法调整。
- 浏览器指纹或 IP 追踪。
- 永久逐次浏览历史。
- Realtime、WebSocket、Push 或 Email 通知。
- 合作商报表、导出或独立 Analytics 页面。
- Google Analytics、Google AdSense 或第三方追踪平台接入。

