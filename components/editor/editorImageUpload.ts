import { supabase } from "@/lib/supabase";

export async function uploadEditorImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("只能上传图片文件。");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("图片不能超过 10MB。");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("请先登录后再上传图片。");
  }

  const cleanName = file.name.replace(/\s+/g, "-");
  const fileName = `${user.id}/${Date.now()}-${cleanName}`;

  const { error } = await supabase.storage
    .from("images")
    .upload(fileName, file);

  if (error) {
    throw error;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("images").getPublicUrl(fileName);

  return publicUrl;
}
