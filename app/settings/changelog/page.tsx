export default function SettingsChangelogPage() {
  const logs = [
    {
      version: "Alpha 0.9.3",
      date: "2026.08.27",
      features: [
        "公开文章与日记新增分享面板，可复制链接或调用系统分享",
        "新增包含故事开头的竖版 Story 分享图片，可保存后分享到其他平台",
        "分享图片仅支持作者已公开、已发布且未删除的内容",
      ],
      fixes: [
        "修复日记广场加载失败时误显示为没有日记的问题，并提供重新加载入口",
        "修复手机端喜欢数量换行，导致喜欢、分享与举报按钮高度不一致的问题",
      ],
      improvements: [
        "手机端自己的作品采用喜欢与分享各半，其他居民作品采用喜欢、分享与举报三等分",
        "统一手机端操作按钮高度与间距，保持电脑版原有布局",
        "喜欢数量较大时使用千、万、亿缩写，并为辅助阅读保留完整数量",
        "窄屏下精简点赞文字，用爱心与颜色区分状态，减少按钮拥挤",
      ],
    },

    {
      version: "Alpha 0.9.2",
      date: "2026.08.26",
      features: [
        "留言区新增楼中楼回复",
        "回复现在会标出对象，并收在原留言下方",
        "评论管理新增今日留言、异常字眼检测与自定义检测词库",
        "软删除评论会在保留 30 天后自动永久清理",
      ],
      fixes: [
        "修复留言喜欢、取消喜欢与重新喜欢无法更新的问题",
        "修复文章喜欢提示撑高操作栏，导致编辑按钮变形的问题",
        "修复居民房间切换文章与日记时仍显示全部作品的问题",
        "修复较早文章可能被日记数量上限隐藏的问题",
      ],
      improvements: [
        "留言与回复使用更紧凑的深夜回声排版",
        "喜欢与回复操作加入更清楚的图示",
        "优化手机端文章与日记的喜欢、举报和编辑按钮布局",
        "自己的内容无法点赞时，会从导航栏下方显示柔和提示",
      ],
    },

    {
      version: "Alpha 0.9.1",
      date: "2026.08.25",
      features: [
        "通知中心新增「信箱」与「互动」分区",
        "喜欢、评论和回复现在会集中显示在互动页面",
        "同一篇内容收到的多个喜欢会自动合并",
        "意见反馈新增业配合作申请入口",
      ],
      fixes: [
        "修复重复喜欢可能产生多条通知的问题",
        "修复反馈状态更新后弹窗没有自动关闭的问题",
        "修复后台部分开关状态显示不一致的问题",
      ],
      improvements: [
        "优化通知筛选、未读数量与手机端显示",
        "优化反馈处理流程与居民通知体验",
        "后台操作日志加入中文名称与柔和分类色彩",
        "优化业配排期、投放权重说明与输入防错",
        "商业合作资料现在由独立后台页面安全处理",
      ],
    },

    {
      version: "Alpha 0.9.0",
      date: "2026.08.24",
      features: [
        "新增业配管理中心",
        "新增业配图片、链接、排期与广告位管理",
        "新增今日、过去 7 天、过去 30 天与三个月记录筛选",
      ],
      fixes: [
        "加强业配图片格式与上传安全检查",
        "修复排期时间与马来西亚时间不一致的问题",
      ],
      improvements: [
        "所有业配与广告位默认保持关闭",
        "优化后台侧栏与手机版数据卡片的空间使用",
        "业配统计只保留匿名汇总，不记录居民阅读历史",
      ],
    },

    {
      version: "Alpha 0.8.2",
      date: "2026.06.18",
      features: [
        "新增「关于网站」页面",
        "新增「更新日志」页面",
      ],
      fixes: [
        "修复已删除内容仍显示在广场的问题",
        "修复个人房间显示已删除文章的问题",
        "修复手机端编辑器提示卡遮挡问题",
        "修复多层弹窗层级异常",
      ],
      improvements: [
        "手机端编辑器改为提示按钮模式",
        "Alert 全面升级为 ConfirmDialog",
        "优化编辑器移动端体验",
      ],
    },

    {
      version: "Alpha 0.8.1",
      date: "2026.06.16",
      features: [
        "新增全站信件系统",
        "新增通知信箱",
        "新增世界公告",
      ],
      fixes: [
        "修复点赞通知异常",
        "修复成长记录写入问题",
        "修复注册后资料创建异常",
      ],
      improvements: [
        "优化管理后台布局",
        "优化草稿编辑流程",
      ],
    },

    {
      version: "Alpha 0.8.0",
      date: "2026.06.15",
      features: [
        "小时代 Alpha 正式开放测试",
        "开放文章、日记、房间系统",
        "开放居民成长与徽章系统",
      ],
      fixes: [],
      improvements: [],
    },
  ];

  return (
    <main className="min-h-screen text-white">
      <section className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 backdrop-blur-2xl md:p-10">
        <p className="text-xs tracking-[0.4em] text-white/25">
          CHANGELOG
        </p>

        <h1 className="mt-4 text-4xl font-light">
          更新日志
        </h1>

        <p className="mt-4 max-w-2xl text-sm leading-7 text-white/45">
          小时代会慢慢成长。
          这里记录每一次新增、修复与改变。
        </p>

        <div className="mt-10 space-y-8">
          {logs.map((log) => (
            <article
              key={log.version}
              className="rounded-[1.8rem] border border-white/10 bg-black/25 p-6"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-light">
                    {log.version}
                  </h2>

                  <p className="mt-2 text-sm text-white/35">
                    {log.date}
                  </p>
                </div>
              </div>

              {log.features.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-emerald-200">
                    ✨ 新功能
                  </h3>

                  <ul className="mt-3 space-y-2 text-sm leading-7 text-white/60">
                    {log.features.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {log.fixes.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-amber-200">
                    🛠 修复
                  </h3>

                  <ul className="mt-3 space-y-2 text-sm leading-7 text-white/60">
                    {log.fixes.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {log.improvements.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-sky-200">
                    🎨 优化
                  </h3>

                  <ul className="mt-3 space-y-2 text-sm leading-7 text-white/60">
                    {log.improvements.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
