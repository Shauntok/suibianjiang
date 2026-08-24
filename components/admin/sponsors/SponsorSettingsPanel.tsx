"use client";

import { AlertCircle, LoaderCircle, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  sponsorPlacements,
  type SponsorPlacement,
  type SponsorSettings,
} from "@/lib/sponsors/types";

type SponsorSettingsPanelProps = {
  initialSettings?: SponsorSettings;
};

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

export default function SponsorSettingsPanel({
  initialSettings,
}: SponsorSettingsPanelProps) {
  const [settings, setSettings] = useState<SponsorSettings | null>(
    initialSettings ?? null
  );
  const [loading, setLoading] = useState(!initialSettings);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [showEnableConfirmation, setShowEnableConfirmation] = useState(false);

  useEffect(() => {
    if (initialSettings) return;

    let active = true;

    async function loadSettings() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/admin/sponsors/settings", {
          cache: "no-store",
        });
        const body = await readJson(response);

        if (!response.ok || !isSettingsResponse(body)) {
          throw new Error(readApiError(body, "无法读取商业合作设置。"));
        }

        if (active) {
          setSettings(body.settings);
        }
      } catch (reason) {
        if (active) {
          setError(errorMessage(reason, "无法读取商业合作设置。"));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      active = false;
    };
  }, [initialSettings, retryKey]);

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

  function updateSettings(
    updater: (current: SponsorSettings) => SponsorSettings
  ) {
    setSettings((current) => (current ? updater(current) : current));
    setDirty(true);
    setError("");
  }

  async function persistSettings(nextSettings: SponsorSettings) {
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/admin/sponsors/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextSettings),
      });
      const body = await readJson(response);

      if (!response.ok || !isSettingsResponse(body)) {
        throw new Error(readApiError(body, "无法保存商业合作设置。"));
      }

      setSettings(body.settings);
      setDirty(false);
      toast.success("商业合作设置已保存");
      return true;
    } catch (reason) {
      const message = errorMessage(reason, "无法保存商业合作设置。");
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleMasterSwitch() {
    if (!settings || saving) return;

    if (!settings.commercialEnabled) {
      setShowEnableConfirmation(true);
      return;
    }

    await persistSettings({ ...settings, commercialEnabled: false });
  }

  async function confirmEnable() {
    if (!settings) return;

    const saved = await persistSettings({
      ...settings,
      commercialEnabled: true,
    });

    if (saved) {
      setShowEnableConfirmation(false);
    }
  }

  if (loading) {
    return (
      <section
        aria-labelledby="sponsor-settings-title"
        className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-5"
      >
        <div className="flex min-h-28 items-center gap-3 text-sm text-zinc-500">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          正在读取商业合作设置...
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section
        aria-labelledby="sponsor-settings-title"
        className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-5"
      >
        <div className="flex items-start gap-3">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 text-red-300" />
          <div>
            <h2 id="sponsor-settings-title" className="text-base font-semibold">
              商业合作设置无法载入
            </h2>
            <p className="mt-1 text-sm leading-6 text-red-100/60">
              {error || "请稍后再试。"}
            </p>
            <button
              type="button"
              onClick={() => setRetryKey((current) => current + 1)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-red-400/30 px-3 text-sm text-red-100 transition hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              重试
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section
        aria-labelledby="sponsor-settings-title"
        className="rounded-lg border border-zinc-800 bg-zinc-950/50"
      >
        <div className="flex flex-col gap-5 border-b border-zinc-800 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-zinc-200">
              <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
              <h2 id="sponsor-settings-title" className="text-base font-semibold">
                全局投放设置
              </h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
              总开关关闭时前台不会返回任何素材。开启后，各广告位仍需分别启用。
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="text-right">
              <p className="text-sm font-medium text-zinc-200">
                {settings.commercialEnabled ? "投放已开启" : "投放保持关闭"}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                {settings.commercialEnabled ? "按排期与位置设置投放" : "默认安全状态"}
              </p>
            </div>
            <Switch
              label="商业合作总开关"
              checked={settings.commercialEnabled}
              disabled={saving}
              onChange={() => void handleMasterSwitch()}
            />
          </div>
        </div>

        <div className="p-5">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">广告位开关</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-600">
              新位置默认关闭。这里控制全站位置，单个业配还需在自己的表单内启用。
            </p>
          </div>

          <div className="mt-4 grid gap-x-6 border-y border-zinc-800 sm:grid-cols-2">
            {sponsorPlacements.map((placement) => (
              <div
                key={placement}
                className="flex min-h-14 items-center justify-between gap-4 border-b border-zinc-900 py-2 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
              >
                <span className="text-sm text-zinc-300">
                  {placementLabels[placement]}
                </span>
                <Switch
                  label={`全局启用${placementLabels[placement]}`}
                  checked={settings.placementEnabled[placement]}
                  disabled={saving}
                  onChange={() =>
                    updateSettings((current) => ({
                      ...current,
                      placementEnabled: {
                        ...current.placementEnabled,
                        [placement]: !current.placementEnabled[placement],
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <NumberField
              label="内文最少自然段"
              value={settings.minimumParagraphs}
              min={0}
              onChange={(value) =>
                updateSettings((current) => ({
                  ...current,
                  minimumParagraphs: value,
                }))
              }
            />
            <NumberField
              label="内文最少字符"
              value={settings.minimumCharacters}
              min={0}
              onChange={(value) =>
                updateSettings((current) => ({
                  ...current,
                  minimumCharacters: value,
                }))
              }
            />
            <NumberField
              label="每页广告上限"
              value={settings.maxAdsPerPage}
              min={0}
              max={3}
              onChange={(value) =>
                updateSettings((current) => ({
                  ...current,
                  maxAdsPerPage: value,
                }))
              }
            />
            <NumberField
              label="合格页展示率 %"
              value={settings.eligibleProbability}
              min={0}
              max={100}
              onChange={(value) =>
                updateSettings((current) => ({
                  ...current,
                  eligibleProbability: value,
                }))
              }
            />
            <NumberField
              label="冷却页数"
              value={settings.cooldownPageViews}
              min={0}
              onChange={(value) =>
                updateSettings((current) => ({
                  ...current,
                  cooldownPageViews: value,
                }))
              }
            />
            <NumberField
              label="最近 10 页广告页上限"
              value={settings.maxAdPagesPerTen}
              min={0}
              max={10}
              onChange={(value) =>
                updateSettings((current) => ({
                  ...current,
                  maxAdPagesPerTen: value,
                }))
              }
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm leading-6 text-red-300">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-zinc-600">
              时区：{settings.timezone} {dirty ? "· 有未保存的设置" : "· 设置已同步"}
            </p>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void persistSettings(settings)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-black transition hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? (
                <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Save aria-hidden="true" className="h-4 w-4" />
              )}
              {saving ? "保存中..." : "保存全局设置"}
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={showEnableConfirmation}
        title="启用商业合作？"
        description="开启后，只有全局与单个业配都启用、且排期有效的位置才会参与投放。新广告位仍保持独立关闭。"
        confirmText="启用商业合作"
        cancelText="继续保持关闭"
        loading={saving}
        onClose={() => setShowEnableConfirmation(false)}
        onConfirm={() => void confirmEnable()}
      />
    </>
  );
}

function Switch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
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
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-[21px] bg-black"
              : "translate-x-0.5 bg-zinc-400"
          }`}
        />
      </span>
    </button>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const id = `sponsor-setting-${label.replaceAll(" ", "-")}`;

  return (
    <div>
      <label htmlFor={id} className="text-xs text-zinc-500">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? next : min);
        }}
        className="mt-1.5 min-h-11 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white outline-none transition focus:border-zinc-500 focus-visible:ring-2 focus-visible:ring-white/20"
      />
    </div>
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isSettingsResponse(
  value: unknown
): value is { settings: SponsorSettings } {
  return (
    typeof value === "object" &&
    value !== null &&
    "settings" in value &&
    typeof value.settings === "object" &&
    value.settings !== null
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
