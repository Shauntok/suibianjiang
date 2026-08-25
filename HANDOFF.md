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
