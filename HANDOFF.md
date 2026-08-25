# HANDOFF

更新时间：2026-08-24

## 当前状态

项目名称：

Our Little Age（小时代）

开发阶段：

社区平台 Alpha 阶段

---

## 已完成

### 用户系统

✓ 注册
✓ 登录
✓ Session检查

---

### 日记系统

✓ 创建日记
✓ 编辑日记
✓ Public
✓ Private
✓ Public View

---

### 文章系统

✓ 创建文章
✓ 编辑文章
✓ Draft
✓ Published
✓ Public View

---

### 广场系统

✓ 日记广场

/space/diaries

✓ 文章广场

/space/articles

---

### 评论系统

✓ Article Comments

✓ Diary Comments

✓ 删除评论

✓ 排序

---

### Home

✓ 最新文章跳转

✓ 最新日记跳转

✓ 广播系统

---

### Profile

✓ 公开居民房间

/u/[username]

✓ 资料编辑

/settings/profile

---

## 最近修复

### 2026-06

修复：

* 日记 Public View 权限问题
* 文章 Public View 权限问题
* Home 最新故事跳转错误
* Space 文章跳转错误
* Space 日记跳转错误
* 评论显示异常

---

## 当前待办

高优先级：

1. Notification System

2. 多账号测试

3. Mobile UI测试

中优先级：

4. 收藏系统

5. 点赞系统

6. 关注系统

长期：

7. 等级系统

8. 称号系统

9. 世界事件系统

---

## 2026-08-24 业配后台阶段交接

### 本阶段已完成

业配资料层与 Admin 管理界面已经完成，保持默认关闭，且未接入任何公开页面投放。

迁移顺序：

1. `supabase/migrations/20260824130000_sponsorship_system.sql`
2. `supabase/migrations/20260824140000_sponsor_admin_mutations.sql`

Admin 路由：

* `/admin/sponsors`
* `/admin/sponsors/new`
* `/admin/sponsors/[id]`

Admin API：

* `GET/POST /api/admin/sponsors`
* `GET/PATCH /api/admin/sponsors/[id]`
* `GET/PATCH /api/admin/sponsors/settings`
* `GET /api/admin/sponsors/stats`
* `POST/DELETE /api/admin/sponsors/upload`

Owner 与 Admin 可管理；Moderator 没有业配导航，API 与数据库 RPC 仍执行权威权限检查。管理 RPC 仅授权 `service_role`，浏览器角色不可直接执行。

### 默认关闭与隐私

* 数据库总开关 `commercial_enabled` 默认 `false`。
* 八个广告位默认全部关闭，placement 记录也默认关闭。
* 新建业配默认保存为 `draft`。
* 只保存匿名每日曝光与点击汇总，不保存用户、IP、文章或阅读历史。
* 当前没有公开业配组件，也没有公开 serve、impression 或 click API；公开投放刻意留待后续阶段。

### 环境与本地验证

本地与部署环境需要：

* `NEXT_PUBLIC_SUPABASE_URL`
* `SUPABASE_SERVICE_ROLE_KEY`（仅服务端，禁止使用 `NEXT_PUBLIC_` 前缀）

2026-08-24 Task 7 本地门禁：

* `npm test`：PASS，6 个文件、110/110 tests。
* 自 `7009b48` 起 27 个 changed JS/TS/TSX 文件的 focused ESLint：PASS，0 findings。
* `npm run build`：PASS，TypeScript 完成，43/43 static pages；Admin 与五个 sponsorship API 路由均被识别。
* `npm audit --omit=dev`：PASS，0 vulnerabilities。
* `git diff --check 7009b48..HEAD`：PASS。
* 全仓 `npm run lint`：非零，209 errors、56 warnings；记录基线为 211 errors、56 warnings，且 changed-file 精确交集为 0。保留为既有 lint 债务。
* Vitest 仍显示既有的 Vite native config-loader ESM advisory，不影响测试结果。

Task 7 由 controller 在 linked Supabase 的独立可回滚事务中重新验证：Task 2 pgTAP `1..113`、Task 4 pgTAP `1..25`；ROLLBACK 后 sponsor tables 为 0，Task 4 functions 为 0。没有持久化任何 SQL。

### 上传、时区与界面证据

上传仅接受受限大小且结构校验通过的 JPEG、PNG 与 simple WebP，使用现有 `images` bucket 的 `sponsors/{campaign-id}/{placement}/...` 路径。未保存编辑产生的新上传可通过 `DELETE /api/admin/sponsors/upload` 补偿清理；该端点只接受严格的 sponsor 路径，不删除居民图片或既有任意路径。

排期统一按 `Asia/Kuala_Lumpur`（UTC+08）解释。统计范围为 `today`、`7d`、`30d`、`3m`。

Task 6 截图：

* Desktop 1440x900：`C:\Users\PC\.codex\visualizations\2026\08\24\01a032b3-fbc7-7632-8a79-56ed60d23d65\task6-sponsors-1440x900.png`
* Mobile 375x812：`C:\Users\PC\.codex\visualizations\2026\08\24\01a032b3-fbc7-7632-8a79-56ed60d23d65\task6-sponsors-375x812.png`

### 尚未发生与下一道门

* 生产 migration：未应用。
* 部署：未执行。
* 公开业配投放：不存在，未启用。

后续必须依序明确批准：review/merge，生产 migration apply，deploy，生产 smoke test。生产验证前保持总开关和所有广告位关闭。

---

## 2026-08-25 通知中心分流与互动聚合

### 本阶段已完成

`/notifications` 已分为一级「信箱 / 互动」。信箱继续使用原有未读、已读、重要、星标与垃圾桶功能；互动提供全部、喜欢、评论、回复筛选。旧互动通知通过现有 `type` 与历史标题前缀自动分类，不删除历史数据。

点赞通知现在由 `post_likes` / `comment_likes` 的有效行聚合。同一接收人、同一目标只保留一行 `type = 'like'` 通知：新增点赞更新人数、最近居民和 `last_activity_at`；取消点赞重新计算；人数归零时隐藏该组；重新点赞恢复同一通知 ID 并重新标记未读。

评论保存为 `type = 'comment'`；带 `parent_id` 的评论保存为 `type = 'reply'`，分别通知文章/日记作者或父评论作者。Navbar 与首页继续按未读且未删除的通知行计数，因此一个点赞聚合组计为 1。

### 已应用 migration

1. `supabase/migrations/20260825090556_notification_interactions.sql`
2. `supabase/migrations/20260825093954_notification_interaction_indexes_and_rls.sql`

新增字段：`actor_id`、`post_id`、`comment_id`、`actor_count`、`recent_actor_ids`、`last_activity_at`。没有新建主通知表，也没有清空或重写历史通知。

通知 UPDATE 权限已收窄：普通 authenticated 用户只能更新 `is_read`、`is_starred`、`is_important`、`deleted_at`，不能改写标题、内容、接收人或聚合字段。新增外键均有覆盖索引，通知 SELECT/UPDATE RLS 使用缓存式 `(select auth.uid())`。

### 验证结果

* pgTAP：29/29，通过；覆盖三人点赞聚合、取消、全取消、重新点赞复用、评论、回复、列权限、索引和 RLS。
* Vitest：10 个文件、143/143，通过。
* `npm run build`：通过，43/43 static pages。
* 通知相关 focused ESLint：通过。
* 浏览器：桌面与 375x812 手机通过；无横向溢出、Next.js error overlay 或 console error。
* 本地入口：`http://localhost:3000/notifications`。

### 历史兼容与限制

历史互动通知缺少 actor/target ID，因此只按旧标题分类到互动，无法安全合并；这些旧未读行仍各自计入 Navbar，读完后自然消退。新通知从 migration 应用后开始完整聚合。

当前评论组件尚未提供回复输入 UI，但数据库已有 `parent_id`，本阶段只保证未来或其他入口写入父评论时会产生正确 reply 通知，没有扩大评论系统范围。

Supabase 顾问仍报告仓库原有的 GraphQL 表可发现性、泄露密码保护未启用、notifications 两条 INSERT permissive policy 等全局告警；本阶段未越界修改这些既有系统。新 migration 引入的外键缺索引与通知 RLS init-plan 告警已经消除。

### 2026-08-25 通知界面复核

居民 `系小卓呀` 的文章历史上收到 4 条其他居民评论，时间为 2026-06-04 至 2026-06-27。数据库中没有对应的 active 或 soft-deleted 评论通知；这些评论早于评论通知触发器上线，因此当时从未创建通知，不是当前互动分类遗漏，也不是居民后来删除。当前 `comment_created_growth` trigger 已启用，后续新评论会产生 `comment` / `reply` 通知；本阶段没有补发几个月前的未读通知。

`/notifications` 一级「信箱 / 互动」现使用稳定的细边框选中状态，不再依赖浏览器焦点外观。信箱的未读、已读、重要、星标、垃圾桶筛选统一显示文字和数量，与互动筛选保持一致；正式信件的星标、重要、已读、删除、恢复操作在桌面显示图标并在 hover / keyboard focus 时显示名称，手机则保留图标和文字。

复核门禁：Vitest 11 个文件、147/147 tests；production build 通过；通知 focused ESLint 通过；浏览器无 error overlay 或 console error。

### 2026-08-25 反馈最终状态

`/admin/feedback` 将 `resolved`（已完成）与 `closed`（已关闭）视为反馈闭环的最终状态。进入任一最终状态后，卡片不再渲染右侧「处理中 / 已完成 / 关闭」操作区；`pending` 与 `in_progress` 仍保留处理入口。

Admin 桌面侧栏已压缩分组、菜单与图标间距，并限制在视口高度内独立滚动。常见桌面高度可直接看到 Owner 与系统选项；更矮视口不会再把底部菜单截断。

`/admin/logs` 的反馈状态操作已加入专属显示映射：处理中为蓝色、已完成为绿色、已关闭为柔和红色，并把历史日志中的英文状态值转换成完整中文说明。转换只发生在显示层，不修改既有 `admin_logs` 审计数据。

公告相关操作日志也已完整中文化，发布、预约、显示、关闭、删除及两种自动发布 action 均使用统一紫色标签；历史详情与 `admin_logs` 原始数据保持不变。

`/admin/sponsors/new` 与业配编辑页的排期控件已由单一 `datetime-local` 输入改为日期日历加 15 分钟时间下拉，并明确标示 MYT（UTC+8）。底层 ISO 转换、校验与数据库结构保持不变；投放权重字段新增相对展示机会说明。

状态、开始时间、结束时间与投放权重现使用等高标签行并在桌面顶端对齐。权重长说明已移入标签旁的信息按钮：hover / focus 显示简短 tooltip，点击打开含系统上限、100:50、1000:1 与十则业配极端比例的完整说明窗口。当前仍不设置同时有效业配的硬数量上限；单页展示上限维持数据库既有的 3。

投放权重输入新增格式防护：每个业配只接受 1–1000 的单个整数，阻止比例冒号、小数、正负号与科学计数法字符，粘贴非整数内容也会被拒绝并显示中文提示。说明窗口现明确示范广告 A 填 100、广告 B 填 25，而不是在一个输入框填写 100:25。
