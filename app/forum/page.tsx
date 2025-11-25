"use client";

import { useState } from "react";

export default function ForumPage() {
  const [posts, setPosts] = useState([
    { id: 1, author: "Nova", content: "欢迎来到测试论坛！" },
    { id: 2, author: "Shaun", content: "Nova，我们继续开发吧！" },
  ]);

  const [newPost, setNewPost] = useState("");

  const handleSubmit = () => {
    if (!newPost.trim()) return;

    const newEntry = {
      id: posts.length + 1,
      author: "You",
      content: newPost,
    };

    setPosts([newEntry, ...posts]);
    setNewPost("");
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">📝 论坛示例页面</h1>

      {/* 发帖输入框 */}
      <div className="mb-6">
        <textarea
          className="w-full border rounded p-3"
          rows={3}
          placeholder="想说点什么？"
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
        />

        <button
          onClick={handleSubmit}
          className="mt-3 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          发帖
        </button>
      </div>

      {/* 帖子列表 */}
      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="border rounded p-4 shadow-sm">
            <div className="font-semibold">{post.author}</div>
            <div className="text-gray-700 mt-1">{post.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
