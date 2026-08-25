/* eslint-disable @next/next/no-img-element */
"use client";

import {
  AlertCircle,
  ArrowLeft,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import ConfirmDialog from "@/components/ui/ConfirmDialog";

import {
  sponsorPlacements,
  type CampaignInput,
  type CampaignState,
  type SponsorCampaign,
  type SponsorCampaignPlacement,
  type SponsorPlacement,
} from "@/lib/sponsors/types";
import { isSafeSponsorUrl } from "@/lib/sponsors/validation";

type SponsorCampaignFormProps = {
  campaignId?: string;
  initialCampaign?: SponsorCampaign;
  onSaved?: (campaign: SponsorCampaign) => void;
};

type CampaignFields = {
  internalName: string;
  partnerName: string;
  publicTitle: string;
  description: string;
  destinationUrl: string;
  state: CampaignState;
  startsAt: string;
  endsAt: string;
  weight: string;
};

type PlacementDraft = {
  placement: SponsorPlacement;
  enabled: boolean;
  imagePath: string;
  altText: string;
  pendingFile: File | null;
  previewUrl: string;
};

type FormErrors = Partial<
  Record<
    | keyof CampaignFields
    | `placement-${SponsorPlacement}-image`
    | `placement-${SponsorPlacement}-alt`,
    string
  >
>;

type AdminWindow = Window & { adminHasUnsavedChanges?: boolean };

const placementLabels: Record<SponsorPlacement, string> = {
  home_wide: "居民首页宽幅",
  space_wide: "故事广场宽幅",
  article_inline: "文章正文中段",
  diary_inline: "日记正文中段",
  article_after: "文章正文结束后",
  diary_after: "日记正文结束后",
  desktop_left: "桌面左侧直式",
  desktop_right: "桌面右侧直式",
};

const stateLabels: Record<CampaignState, string> = {
  draft: "草稿",
  published: "已发布",
  paused: "暂停",
  archived: "归档",
};

const QUARTER_HOUR_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

const KUALA_LUMPUR_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATETIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const EXPLICIT_ZONE_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i;

export default function SponsorCampaignForm({
  campaignId,
  initialCampaign,
  onSaved,
}: SponsorCampaignFormProps) {
  const router = useRouter();
  const [fields, setFields] = useState<CampaignFields>(() =>
    fieldsFromCampaign(initialCampaign)
  );
  const [placements, setPlacements] = useState<PlacementDraft[]>(() =>
    placementsFromCampaign(initialCampaign)
  );
  const [resolvedCampaignId, setResolvedCampaignId] = useState(
    initialCampaign?.id ?? campaignId ?? ""
  );
  const [loading, setLoading] = useState(Boolean(campaignId && !initialCampaign));
  const [loadError, setLoadError] = useState("");
  const [loadRetryKey, setLoadRetryKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [weightHelpOpen, setWeightHelpOpen] = useState(false);
  const previewUrlsRef = useRef(new Set<string>());

  const isNew = !initialCampaign && !campaignId;
  const hasAnyPlacementAsset = useMemo(
    () => placements.some((placement) => placement.imagePath || placement.pendingFile),
    [placements]
  );

  useEffect(() => {
    if (!campaignId || initialCampaign) return;

    let active = true;

    async function loadCampaign() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch(`/api/admin/sponsors/${campaignId}`, {
          cache: "no-store",
        });
        const body = await readJson(response);

        if (!response.ok || !isCampaignResponse(body)) {
          throw new Error(readApiError(body, "无法读取这份业配。"));
        }

        if (active) {
          setFields(fieldsFromCampaign(body.campaign));
          setPlacements(placementsFromCampaign(body.campaign));
          setResolvedCampaignId(body.campaign.id);
          setDirty(false);
        }
      } catch (reason) {
        if (active) {
          setLoadError(errorMessage(reason, "无法读取这份业配。"));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCampaign();

    return () => {
      active = false;
    };
  }, [campaignId, initialCampaign, loadRetryKey]);

  useEffect(() => {
    (window as AdminWindow).adminHasUnsavedChanges = dirty;

    return () => {
      (window as AdminWindow).adminHasUnsavedChanges = false;
    };
  }, [dirty]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;

    return () => {
      for (const previewUrl of previewUrls) {
        revokePreview(previewUrl);
      }
    };
  }, []);

  function hydrateCampaign(campaign: SponsorCampaign) {
    setFields(fieldsFromCampaign(campaign));
    setPlacements((current) => {
      for (const placement of current) {
        revokeLocalPreview(placement.previewUrl);
      }
      return placementsFromCampaign(campaign);
    });
    setResolvedCampaignId(campaign.id);
    setDirty(false);
  }

  function markDirty() {
    setDirty(true);
    setFormError("");
  }

  function updateField<Key extends keyof CampaignFields>(
    key: Key,
    value: CampaignFields[Key]
  ) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    markDirty();
  }

  function updatePlacement(
    placementName: SponsorPlacement,
    updater: (current: PlacementDraft) => PlacementDraft
  ) {
    setPlacements((current) =>
      current.map((placement) =>
        placement.placement === placementName ? updater(placement) : placement
      )
    );
    setErrors((current) => ({
      ...current,
      [`placement-${placementName}-image`]: undefined,
      [`placement-${placementName}-alt`]: undefined,
    }));
    markDirty();
  }

  function selectFile(placementName: SponsorPlacement, file: File | null) {
    if (!file) return;

    updatePlacement(placementName, (current) => {
      revokeLocalPreview(current.previewUrl);
      const previewUrl = createPreview(file);

      if (previewUrl) {
        previewUrlsRef.current.add(previewUrl);
      }

      return {
        ...current,
        pendingFile: file,
        previewUrl,
      };
    });
  }

  function clearPlacementImage(placementName: SponsorPlacement) {
    updatePlacement(placementName, (current) => {
      revokeLocalPreview(current.previewUrl);
      return {
        ...current,
        enabled: false,
        imagePath: "",
        altText: "",
        pendingFile: null,
        previewUrl: "",
      };
    });
  }

  function revokeLocalPreview(value: string) {
    revokePreview(value);
    previewUrlsRef.current.delete(value);
  }

  function validateForm() {
    const nextErrors: FormErrors = {};

    for (const key of [
      "internalName",
      "partnerName",
      "publicTitle",
      "description",
      "destinationUrl",
      "startsAt",
      "endsAt",
    ] as const) {
      if (!fields[key].trim()) {
        nextErrors[key] = "此字段不能为空。";
      }
    }

    if (fields.destinationUrl && !isSafeSponsorUrl(fields.destinationUrl)) {
      nextErrors.destinationUrl = "目标网址只允许使用 http 或 https。";
    }

    const startsAt = parseKualaLumpurDatetimeLocal(fields.startsAt);
    const endsAt = parseKualaLumpurDatetimeLocal(fields.endsAt);

    if (fields.startsAt && startsAt === null) {
      nextErrors.startsAt = "请输入有效的开始时间。";
    }

    if (fields.endsAt && endsAt === null) {
      nextErrors.endsAt = "请输入有效的结束时间。";
    } else if (
      startsAt !== null &&
      endsAt !== null &&
      endsAt <= startsAt
    ) {
      nextErrors.endsAt = "结束时间必须晚于开始时间。";
    }

    const weight = Number(fields.weight);
    if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
      nextErrors.weight = "投放权重必须是 1 至 1000 的整数。";
    }

    for (const placement of placements) {
      const label = placementLabels[placement.placement];
      const hasImage = Boolean(placement.imagePath || placement.pendingFile);

      if (placement.enabled && !hasImage) {
        nextErrors[`placement-${placement.placement}-image`] =
          `请先为${label}选择照片。`;
      }

      if (hasImage && !placement.altText.trim()) {
        nextErrors[`placement-${placement.placement}-alt`] =
          `请填写${label}的替代文字。`;
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function buildCampaignInput(
    savedImagePaths: Map<SponsorPlacement, string> = new Map()
  ): CampaignInput {
    const startsAt = toKualaLumpurIso(fields.startsAt);
    const endsAt = toKualaLumpurIso(fields.endsAt);

    if (!startsAt || !endsAt) {
      throw new Error("排期时间无效，请检查后重试。");
    }

    const placementInput: SponsorCampaignPlacement[] = placements.flatMap(
      (placement) => {
        const imagePath =
          savedImagePaths.get(placement.placement) ?? placement.imagePath;

        if (!imagePath) return [];

        return [
          {
            placement: placement.placement,
            imagePath,
            altText: placement.altText.trim(),
            enabled: placement.enabled,
          },
        ];
      }
    );

    return {
      internalName: fields.internalName.trim(),
      partnerName: fields.partnerName.trim(),
      publicTitle: fields.publicTitle.trim(),
      description: fields.description.trim(),
      destinationUrl: fields.destinationUrl.trim(),
      state: isNew && !resolvedCampaignId ? "draft" : fields.state,
      startsAt,
      endsAt,
      weight: Number(fields.weight),
      placements: placementInput,
    };
  }

  async function saveCampaign() {
    if (saving || !validateForm()) return;

    setSaving(true);
    setFormError("");
    const newlyUploadedPaths: string[] = [];

    try {
      let activeCampaignId = resolvedCampaignId;
      let savedCampaign: SponsorCampaign | null = null;

      if (!activeCampaignId) {
        const response = await fetch("/api/admin/sponsors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildCampaignInput()),
        });
        const body = await readJson(response);

        if (!response.ok || !isCampaignResponse(body)) {
          throw new Error(readApiError(body, "无法建立业配草稿。"));
        }

        activeCampaignId = body.campaign.id;
        savedCampaign = body.campaign;
        setResolvedCampaignId(activeCampaignId);
      }

      const uploadedPaths = new Map<SponsorPlacement, string>();

      for (const placement of placements) {
        if (!placement.pendingFile) continue;

        const formData = new FormData();
        formData.set("campaignId", activeCampaignId);
        formData.set("placement", placement.placement);
        formData.set("file", placement.pendingFile);
        const uploadResponse = await fetch("/api/admin/sponsors/upload", {
          method: "POST",
          body: formData,
        });
        const uploadBody = await readJson(uploadResponse);

        if (!uploadResponse.ok || !isUploadResponse(uploadBody)) {
          throw new Error(readApiError(uploadBody, "无法上传业配照片。"));
        }

        newlyUploadedPaths.push(uploadBody.path);
        uploadedPaths.set(placement.placement, uploadBody.path);
      }

      if (resolvedCampaignId || uploadedPaths.size > 0) {
        const response = await fetch(`/api/admin/sponsors/${activeCampaignId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildCampaignInput(uploadedPaths)),
        });
        const body = await readJson(response);

        if (!response.ok || !isCampaignResponse(body)) {
          throw new Error(readApiError(body, "无法保存业配资料。"));
        }

        savedCampaign = body.campaign;
      }

      if (!savedCampaign) {
        throw new Error("无法确认业配保存结果。");
      }

      hydrateCampaign(savedCampaign);
      toast.success(isNew ? "业配草稿已建立" : "业配资料已保存");
      onSaved?.(savedCampaign);

      if (isNew && !onSaved) {
        router.push(`/admin/sponsors/${savedCampaign.id}`);
      }
    } catch (reason) {
      if (newlyUploadedPaths.length > 0) {
        await cleanupNewUploads(newlyUploadedPaths);
      }

      const message = errorMessage(reason, "无法保存业配资料。");
      setFormError(message);
      setDirty(true);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function cleanupNewUploads(paths: string[]) {
    await Promise.allSettled(
      paths.map((path) =>
        fetch("/api/admin/sponsors/upload", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path }),
        })
      )
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-5">
        <div className="flex min-h-40 items-center gap-3 text-sm text-zinc-500">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          正在读取业配资料...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-5">
        <div className="flex items-start gap-3">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 text-red-300" />
          <div>
            <h1 className="text-lg font-semibold">无法打开这份业配</h1>
            <p role="alert" className="mt-2 text-sm leading-6 text-red-100/60">
              {loadError}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setLoadRetryKey((current) => current + 1)}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-red-400/30 px-3 text-sm text-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                重试
              </button>
              <Link
                href="/admin/sponsors"
                className="inline-flex min-h-11 items-center px-3 text-sm text-zinc-400 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                返回业配中心
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-12 lg:pt-0">
      <ConfirmDialog
        open={weightHelpOpen}
        title="什么是投放权重？"
        description="权重不是广告数量，而是多个合资格业配同时竞争一个展示机会时的相对比例。"
        confirmText="明白了"
        cancelText="关闭"
        onConfirm={() => setWeightHelpOpen(false)}
        onCancel={() => setWeightHelpOpen(false)}
      >
        <div className="space-y-4 text-sm leading-7 text-white/55">
          <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-4">
            <p className="font-medium text-amber-100/80">怎么填写</p>
            <p className="mt-2">
              每个业配只填写一个整数。例如广告 A 填 100，广告 B 填
              25；不要在同一个输入框填写 100:25。
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <p className="font-medium text-white/80">当前系统上限</p>
            <p className="mt-2">目前不限制同时接多少个业配。</p>
            <p>单一页面最多展示 3 个广告，后台默认设置为 2 个。</p>
            <p>单个业配的权重可设为 1 至 1000。</p>
          </div>

          <div>
            <p className="font-medium text-white/80">常见比例</p>
            <p className="mt-1">
              权重 100 : 50，出现机会约为 2 : 1。
            </p>
          </div>

          <div>
            <p className="font-medium text-white/80">两则广告的极端例子</p>
            <p className="mt-1">
              权重 1000 : 1，出现机会约为 99.90% : 0.10%。
            </p>
          </div>

          <div>
            <p className="font-medium text-white/80">同时有 10 则的例子</p>
            <p className="mt-1">
              一则设为 1000，其余九则都设为 1；高权重业配约占
              99.11%，其余每则约占 0.10%。
            </p>
          </div>
        </div>
      </ConfirmDialog>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/admin/sponsors"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-500 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            返回业配中心
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-100">
            {isNew ? "新建业配草稿" : "编辑业配"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            {isNew
              ? "先保存为草稿；前台不会因为建立草稿而开始投放。"
              : "状态、排期与各广告位素材会在一次保存中同步。"}
          </p>
        </div>

        <p
          className={`text-xs ${dirty ? "text-amber-200/80" : "text-zinc-600"}`}
          aria-live="polite"
        >
          {dirty ? "有未保存的修改" : "所有修改已保存"}
        </p>
      </header>

      <form
        aria-label="业配资料"
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void saveCampaign();
        }}
      >
        <section
          aria-labelledby="campaign-basics-title"
          className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-5"
        >
          <div className="border-b border-zinc-800 pb-4">
            <h2 id="campaign-basics-title" className="text-base font-semibold">
              基本资料
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              内部名称只供运营辨识；合作方、标题与说明会用于前台素材。
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextField
              label="内部名称"
              value={fields.internalName}
              error={errors.internalName}
              onChange={(value) => updateField("internalName", value)}
            />
            <TextField
              label="合作方名称"
              value={fields.partnerName}
              error={errors.partnerName}
              onChange={(value) => updateField("partnerName", value)}
            />
            <TextField
              label="前台标题"
              value={fields.publicTitle}
              error={errors.publicTitle}
              onChange={(value) => updateField("publicTitle", value)}
            />
            <TextField
              label="目标网址"
              type="url"
              value={fields.destinationUrl}
              error={errors.destinationUrl}
              placeholder="https://partner.example/offer"
              onChange={(value) => updateField("destinationUrl", value)}
            />
            <div className="sm:col-span-2">
              <TextAreaField
                label="简短说明"
                value={fields.description}
                error={errors.description}
                onChange={(value) => updateField("description", value)}
              />
            </div>
          </div>
        </section>

        <section
          aria-labelledby="campaign-delivery-title"
          className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-5"
        >
          <div className="border-b border-zinc-800 pb-4">
            <h2 id="campaign-delivery-title" className="text-base font-semibold">
              状态与排期
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              新业配固定从草稿开始；所有排期使用马来西亚时间 MYT（UTC+8）。
            </p>
          </div>

          <div className="mt-5 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-[0.8fr_1.35fr_1.35fr_0.8fr]">
            <SelectField
              label="状态"
              value={fields.state}
              disabled={isNew && !resolvedCampaignId}
              options={(Object.keys(stateLabels) as CampaignState[]).map(
                (value) => ({ value, label: stateLabels[value] })
              )}
              onChange={(value) => updateField("state", value as CampaignState)}
            />
            <ScheduleDateTimeField
              label="开始"
              value={fields.startsAt}
              error={errors.startsAt}
              onChange={(value) => updateField("startsAt", value)}
            />
            <ScheduleDateTimeField
              label="结束"
              value={fields.endsAt}
              error={errors.endsAt}
              onChange={(value) => updateField("endsAt", value)}
            />
            <WeightField
              value={fields.weight}
              error={errors.weight}
              onChange={(value) => updateField("weight", value)}
              onOpenHelp={() => setWeightHelpOpen(true)}
            />
          </div>
        </section>

        <section
          aria-labelledby="campaign-placements-title"
          className="rounded-lg border border-zinc-800 bg-zinc-950/50"
        >
          <div className="border-b border-zinc-800 p-5">
            <h2 id="campaign-placements-title" className="text-base font-semibold">
              广告位与照片
            </h2>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              每张已选择的照片都必须有替代文字。单个业配开关与全局位置开关彼此独立。
            </p>
          </div>

          <div className="grid md:grid-cols-2">
            {placements.map((placement) => {
              const label = placementLabels[placement.placement];
              const imageError =
                errors[`placement-${placement.placement}-image`];
              const altError = errors[`placement-${placement.placement}-alt`];
              const imageUrl =
                placement.previewUrl || publicImageUrl(placement.imagePath);

              return (
                <div
                  key={placement.placement}
                  className="min-w-0 border-b border-zinc-800 p-5 md:odd:border-r md:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <div className="flex min-h-11 items-center justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium text-zinc-200">
                        {label}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-600">
                        {placement.enabled ? "这个业配已启用此位置" : "此位置保持关闭"}
                      </p>
                    </div>
                    <Switch
                      label={`启用${label}`}
                      checked={placement.enabled}
                      onChange={() =>
                        updatePlacement(placement.placement, (current) => ({
                          ...current,
                          enabled: !current.enabled,
                        }))
                      }
                    />
                  </div>

                  {imageUrl ? (
                    <div className="mt-3 aspect-[16/7] overflow-hidden rounded-md border border-zinc-800 bg-black">
                      <img
                        src={imageUrl}
                        alt={placement.altText || "待填写替代文字的业配预览"}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 flex aspect-[16/7] items-center justify-center rounded-md border border-dashed border-zinc-800 bg-black text-zinc-700">
                      <ImagePlus aria-hidden="true" className="h-5 w-5" />
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label
                      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-zinc-700 px-3 text-xs text-zinc-300 transition hover:border-zinc-500 hover:text-white focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white"
                    >
                      <input
                        id={`sponsor-image-${placement.placement}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        aria-label={`${label}照片`}
                        onChange={(event) =>
                          selectFile(
                            placement.placement,
                            event.target.files?.[0] ?? null
                          )
                        }
                      />
                      <ImagePlus aria-hidden="true" className="h-4 w-4" />
                      {placement.imagePath || placement.pendingFile ? "更换照片" : "选择照片"}
                    </label>
                    {(placement.imagePath || placement.pendingFile) && (
                      <button
                        type="button"
                        aria-label={`移除${label}照片`}
                        title={`移除${label}照片`}
                        onClick={() => clearPlacementImage(placement.placement)}
                        className="flex h-11 w-11 items-center justify-center rounded-md border border-zinc-800 text-zinc-500 transition hover:border-red-500/50 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {placement.pendingFile && (
                    <p className="mt-2 truncate text-xs text-zinc-600">
                      待上传：{placement.pendingFile.name}
                    </p>
                  )}
                  {imageError && (
                    <p role="alert" className="mt-2 text-xs text-red-300">
                      {imageError}
                    </p>
                  )}

                  <div className="mt-3">
                    <TextField
                      label={`${label}替代文字`}
                      value={placement.altText}
                      error={altError}
                      disabled={!placement.imagePath && !placement.pendingFile}
                      placeholder="描述照片里看见的内容"
                      onChange={(value) =>
                        updatePlacement(placement.placement, (current) => ({
                          ...current,
                          altText: value,
                        }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {formError && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-4 text-sm leading-6 text-red-200"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-zinc-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-zinc-600">
            {hasAnyPlacementAsset
              ? "保存时会先上传新照片，再同步业配资料。"
              : "尚未选择任何广告位照片。"}
          </p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-black transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save aria-hidden="true" className="h-4 w-4" />
            )}
            {saving ? "保存中..." : isNew ? "保存草稿" : "保存修改"}
          </button>
        </div>
      </form>
    </div>
  );
}

function WeightField({
  value,
  error,
  onChange,
  onOpenHelp,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onOpenHelp: () => void;
}) {
  const id = "sponsor-field-投放权重";
  const errorId = `${id}-error`;
  const tooltipId = `${id}-tooltip`;
  const [guardError, setGuardError] = useState("");
  const displayError = error || guardError;
  const formatError = "这里只填写一个整数，例如 100；不要填写 100:25。";

  function acceptWeight(nextValue: string) {
    if (nextValue && !/^\d+$/.test(nextValue)) {
      setGuardError(formatError);
      return;
    }

    if (nextValue) {
      const numericValue = Number(nextValue);

      if (numericValue < 1 || numericValue > 1000) {
        setGuardError("投放权重必须是 1 至 1000 的整数。");
        return;
      }
    }

    setGuardError("");
    onChange(nextValue);
  }

  return (
    <div>
      <div className="flex h-5 items-center gap-1.5">
        <label htmlFor={id} className="text-xs text-zinc-500">
          投放权重
        </label>
        <span className="group relative inline-flex">
          <button
            type="button"
            aria-label="查看投放权重说明"
            aria-describedby={tooltipId}
            onClick={onOpenHelp}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-zinc-600 outline-none transition hover:text-zinc-300 focus-visible:ring-1 focus-visible:ring-white/40"
          >
            <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <span
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-center text-xs font-normal leading-5 text-white/70 opacity-0 shadow-2xl transition group-hover:opacity-100 group-focus-within:opacity-100"
          >
            每个业配只填一个整数，例如 100；不要填 100:25。权重决定多个合资格业配之间的相对出现机会，点击查看比例与上限。
          </span>
        </span>
      </div>
      <input
        id={id}
        type="number"
        value={value}
        min={1}
        max={1000}
        step={1}
        inputMode="numeric"
        aria-invalid={displayError ? "true" : "false"}
        aria-describedby={displayError ? errorId : undefined}
        onKeyDown={(event) => {
          if ([":", "：", ".", ",", "-", "+", "e", "E"].includes(event.key)) {
            event.preventDefault();
            setGuardError(formatError);
          }
        }}
        onPaste={(event) => {
          const pastedValue = event.clipboardData.getData("text").trim();

          if (!/^\d+$/.test(pastedValue)) {
            event.preventDefault();
            setGuardError(formatError);
          }
        }}
        onChange={(event) => acceptWeight(event.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white outline-none transition focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-white/20"
      />
      {displayError && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-300">
          {displayError}
        </p>
      )}
    </div>
  );
}

function ScheduleDateTimeField({
  label,
  value,
  error,
  onChange,
}: {
  label: "开始" | "结束";
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [dateValue = "", timeValue = ""] = value.split("T", 2);
  const dateId = `sponsor-field-${label}-date`;
  const timeId = `sponsor-field-${label}-time`;
  const errorId = `sponsor-field-${label}-error`;
  const timeOptions =
    timeValue && !QUARTER_HOUR_OPTIONS.includes(timeValue)
      ? [timeValue, ...QUARTER_HOUR_OPTIONS]
      : QUARTER_HOUR_OPTIONS;

  function updateSchedule(nextDate: string, nextTime: string) {
    if (!nextDate && !nextTime) {
      onChange("");
      return;
    }

    onChange(`${nextDate}T${nextTime}`);
  }

  return (
    <div>
      <p className="flex h-5 items-center text-xs text-zinc-500">{label}时间</p>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
        <div>
          <label htmlFor={dateId} className="sr-only">
            {label}日期
          </label>
          <input
            id={dateId}
            aria-label={`${label}日期`}
            type="date"
            value={dateValue}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => updateSchedule(event.target.value, timeValue)}
            className="min-h-11 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white [color-scheme:dark] outline-none transition focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-white/20"
          />
        </div>
        <div>
          <label htmlFor={timeId} className="sr-only">
            {label}时间
          </label>
          <select
            id={timeId}
            aria-label={`${label}时间`}
            value={timeValue}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => updateSchedule(dateValue, event.target.value)}
            className="min-h-11 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white outline-none transition focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <option value="">选择时间</option>
            {timeOptions.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  error,
  type = "text",
  placeholder,
  disabled,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  type?: "text" | "url" | "number" | "datetime-local";
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}) {
  const id = `sponsor-field-${label.replaceAll(" ", "-")}`;
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="flex h-5 items-center text-xs text-zinc-500">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white outline-none transition placeholder:text-zinc-700 focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:bg-zinc-950 disabled:text-zinc-700"
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function TextAreaField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = `sponsor-field-${label}`;
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="text-xs text-zinc-500">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        value={value}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-zinc-800 bg-black px-3 py-2.5 text-sm leading-6 text-white outline-none transition focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-white/20"
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const id = `sponsor-field-${label}`;

  return (
    <div>
      <label htmlFor={id} className="flex h-5 items-center text-xs text-zinc-500">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white outline-none transition focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-white/20 disabled:cursor-not-allowed disabled:bg-zinc-950 disabled:text-zinc-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onChange}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <span
        aria-hidden="true"
        className={`relative h-5 w-10 rounded-full border transition-colors ${
          checked
            ? "border-amber-300/60 bg-amber-300/80"
            : "border-zinc-700 bg-zinc-900"
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-[21px] bg-black"
              : "translate-x-0.5 bg-zinc-400"
          }`}
        />
      </span>
    </button>
  );
}

function fieldsFromCampaign(campaign?: SponsorCampaign): CampaignFields {
  return {
    internalName: campaign?.internalName ?? "",
    partnerName: campaign?.partnerName ?? "",
    publicTitle: campaign?.publicTitle ?? "",
    description: campaign?.description ?? "",
    destinationUrl: campaign?.destinationUrl ?? "",
    state: campaign?.state ?? "draft",
    startsAt: toKualaLumpurDatetimeLocal(campaign?.startsAt),
    endsAt: toKualaLumpurDatetimeLocal(campaign?.endsAt),
    weight: String(campaign?.weight ?? 100),
  };
}

function placementsFromCampaign(campaign?: SponsorCampaign): PlacementDraft[] {
  return sponsorPlacements.map((placement) => {
    const existing = campaign?.placements.find(
      (item) => item.placement === placement
    );

    return {
      placement,
      enabled: existing?.enabled ?? false,
      imagePath: existing?.imagePath ?? "",
      altText: existing?.altText ?? "",
      pendingFile: null,
      previewUrl: "",
    };
  });
}

function toKualaLumpurDatetimeLocal(value?: string) {
  if (!value || !EXPLICIT_ZONE_PATTERN.test(value)) return "";

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";

  return new Date(timestamp + KUALA_LUMPUR_OFFSET_MS)
    .toISOString()
    .slice(0, 16);
}

function toKualaLumpurIso(value: string) {
  const timestamp = parseKualaLumpurDatetimeLocal(value);
  return timestamp === null ? "" : new Date(timestamp).toISOString();
}

function parseKualaLumpurDatetimeLocal(value: string) {
  const match = DATETIME_LOCAL_PATTERN.exec(value);
  if (!match) return null;

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  const wallTime = new Date(0);
  wallTime.setUTCFullYear(year, month - 1, day);
  wallTime.setUTCHours(hour, minute, 0, 0);

  if (
    wallTime.getUTCFullYear() !== year ||
    wallTime.getUTCMonth() !== month - 1 ||
    wallTime.getUTCDate() !== day ||
    wallTime.getUTCHours() !== hour ||
    wallTime.getUTCMinutes() !== minute
  ) {
    return null;
  }

  return wallTime.getTime() - KUALA_LUMPUR_OFFSET_MS;
}

function createPreview(file: File) {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
}

function revokePreview(value: string) {
  if (value && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(value);
  }
}

function publicImageUrl(path: string) {
  if (!path) return "";

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return baseUrl
    ? `${baseUrl}/storage/v1/object/public/images/${encodeURI(path)}`
    : "";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isCampaignResponse(
  value: unknown
): value is { campaign: SponsorCampaign } {
  return (
    typeof value === "object" &&
    value !== null &&
    "campaign" in value &&
    typeof value.campaign === "object" &&
    value.campaign !== null &&
    "id" in value.campaign &&
    typeof value.campaign.id === "string"
  );
}

function isUploadResponse(
  value: unknown
): value is { path: string; publicUrl: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "publicUrl" in value &&
    typeof value.publicUrl === "string"
  );
}

function readApiError(value: unknown, fallback: string) {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }

  return fallback;
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
