"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";

const MAX_AVATAR_SIZE = 8 * 1024 * 1024;

type RoomAvatarEditorProps = {
  profileId: string;
  username: string;
  initialAvatarUrl: string | null;
};

export default function RoomAvatarEditor({
  profileId,
  username,
  initialAvatarUrl,
}: RoomAvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [isOwner, setIsOwner] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkOwnership() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (active) setIsOwner(user?.id === profileId);
    }

    void checkOwnership();

    return () => {
      active = false;
    };
  }, [profileId]);

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !isOwner || uploading) return;

    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件。");
      return;
    }

    if (file.size > MAX_AVATAR_SIZE) {
      toast.error("头像图片不能超过 8MB。");
      return;
    }

    setUploading(true);

    try {
      const cleanName = file.name.replace(/\s+/g, "-");
      const fileName = `${profileId}/${Date.now()}-${cleanName}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profileId);

      if (profileError) throw profileError;

      setAvatarUrl(publicUrl);
      toast.success("头像已更新。");
    } catch {
      toast.error("暂时无法更新头像，请稍后再试。");
    } finally {
      setUploading(false);
    }
  }

  const avatar = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={`${username}的头像`}
      className="h-full w-full object-cover"
    />
  ) : (
    <div
      className="flex h-full w-full items-center justify-center text-3xl text-white/25 md:text-5xl"
      aria-label={`${username}的头像`}
      role="img"
    >
      👤
    </div>
  );

  if (!isOwner) {
    return (
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-black bg-zinc-900 shadow-[0_0_55px_rgba(255,255,255,0.12)] md:h-32 md:w-32">
        {avatar}
      </div>
    );
  }

  return (
    <div className="relative h-20 w-20 shrink-0 md:h-32 md:w-32">
      <button
        type="button"
        aria-label="更换头像"
        title="更换头像"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="group relative h-full w-full overflow-hidden rounded-full border-4 border-black bg-zinc-900 shadow-[0_0_55px_rgba(255,255,255,0.12)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-wait"
      >
        {avatar}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 group-focus-visible:bg-black/45 group-focus-visible:opacity-100">
          {uploading ? (
            <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
          ) : (
            <Camera className="h-6 w-6" aria-hidden="true" />
          )}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label="选择新的头像照片"
        onChange={uploadAvatar}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  );
}
