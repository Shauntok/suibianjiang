import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import SponsorCampaignForm from "@/components/admin/sponsors/SponsorCampaignForm";
import SponsorSettingsPanel from "@/components/admin/sponsors/SponsorSettingsPanel";
import SponsorStatsSummary from "@/components/admin/sponsors/SponsorStatsSummary";
import type {
  SponsorCampaign,
  SponsorSettings,
  SponsorStatsRange,
} from "@/lib/sponsors/types";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

type AdminWindow = Window & { adminHasUnsavedChanges?: boolean };

const campaignId = "c0000000-0000-4000-8000-000000000001";
const newlyUploadedPath =
  `sponsors/${campaignId}/home_wide/` +
  "10000000-0000-4000-8000-000000000001.png";
const existingPath =
  `sponsors/${campaignId}/home_wide/` +
  "20000000-0000-4000-8000-000000000002.png";

const placementSwitchNames = [
  "启用居民首页宽幅",
  "启用故事广场宽幅",
  "启用文章正文中段",
  "启用日记正文中段",
  "启用文章正文结束后",
  "启用日记正文结束后",
  "启用桌面左侧直式",
  "启用桌面右侧直式",
];

const initialCampaign: SponsorCampaign = {
  id: campaignId,
  internalName: "深夜咖啡八月档",
  partnerName: "月光咖啡社",
  publicTitle: "给今晚留一杯慢咖啡",
  description: "一份不打扰阅读的商业合作。",
  destinationUrl: "https://partner.example/coffee",
  state: "draft",
  startsAt: "2026-08-25T00:00:00.000Z",
  endsAt: "2026-09-01T00:00:00.000Z",
  weight: 100,
  placements: [],
  createdBy: "a0000000-0000-4000-8000-000000000001",
  updatedBy: "a0000000-0000-4000-8000-000000000001",
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z",
};

const defaultSettings: SponsorSettings = {
  commercialEnabled: false,
  placementEnabled: {
    home_wide: false,
    space_wide: false,
    article_inline: false,
    diary_inline: false,
    article_after: false,
    diary_after: false,
    desktop_left: false,
    desktop_right: false,
  },
  minimumParagraphs: 8,
  minimumCharacters: 1200,
  maxAdsPerPage: 2,
  eligibleProbability: 60,
  cooldownPageViews: 2,
  maxAdPagesPerTen: 4,
  timezone: "Asia/Kuala_Lumpur",
  placementPriority: [
    "article_inline",
    "diary_inline",
    "article_after",
    "diary_after",
    "desktop_left",
    "desktop_right",
    "home_wide",
    "space_wide",
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/New_York";
});

afterAll(() => {
  if (originalTimezone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimezone;
  }
});

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  navigation.push.mockReset();
  (window as AdminWindow).adminHasUnsavedChanges = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  (window as AdminWindow).adminHasUnsavedChanges = false;
});

describe("SponsorCampaignForm defaults and validation", () => {
  it("shows stored ISO schedules as Kuala Lumpur wall time outside Malaysia", () => {
    expect(new Date("2026-08-25T08:00").toISOString()).toBe(
      "2026-08-25T12:00:00.000Z"
    );

    render(<SponsorCampaignForm initialCampaign={initialCampaign} />);

    expect(screen.getByLabelText("开始时间")).toHaveValue(
      "2026-08-25T08:00"
    );
    expect(screen.getByLabelText("结束时间")).toHaveValue(
      "2026-09-01T08:00"
    );
  });

  it("submits Kuala Lumpur wall time as an exact ISO instant outside Malaysia", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ campaign: initialCampaign }, 201)
    );
    render(<SponsorCampaignForm />);
    fillValidNewCampaign();

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(
      expect.objectContaining({
        startsAt: "2026-08-25T00:00:00.000Z",
        endsAt: "2026-09-01T00:00:00.000Z",
      })
    );
  });

  it("rejects a non-minute Kuala Lumpur local time before saving", async () => {
    render(<SponsorCampaignForm />);
    fillValidNewCampaign({ startsAt: "2026-08-25T08:00:30" });

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(
      await screen.findByText("请输入有效的开始时间。")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts a new campaign as a draft with every placement off", () => {
    render(<SponsorCampaignForm />);

    expect(screen.getByLabelText("状态")).toHaveValue("draft");
    expect(screen.getByLabelText("状态")).toBeDisabled();

    for (const name of placementSwitchNames) {
      expect(screen.getByRole("switch", { name })).not.toBeChecked();
    }
  });

  it.each(["javascript:alert(1)", "data:text/html,bad"])(
    "blocks the unsafe destination URL %s before any request",
    async (destinationUrl) => {
      render(<SponsorCampaignForm />);
      fillValidNewCampaign({ destinationUrl });

      fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

      expect(
        await screen.findByText("目标网址只允许使用 http 或 https。")
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("shows the error beside the end time when it is not after the start", async () => {
    render(<SponsorCampaignForm />);
    fillValidNewCampaign({ endsAt: "2026-08-24T07:59" });

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(
      await screen.findByText("结束时间必须晚于开始时间。")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("结束时间")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires alt text before a selected placement image can be saved", async () => {
    render(<SponsorCampaignForm initialCampaign={initialCampaign} />);
    selectHomeImage();

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(
      await screen.findByText("请填写居民首页宽幅的替代文字。")
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SponsorCampaignForm save lifecycle", () => {
  it("sets the shared dirty flag after an edit", async () => {
    render(<SponsorCampaignForm />);

    fireEvent.change(screen.getByLabelText("内部名称"), {
      target: { value: "尚未保存的夜间档期" },
    });

    await waitFor(() => {
      expect((window as AdminWindow).adminHasUnsavedChanges).toBe(true);
    });
    expect(screen.getByText("有未保存的修改")).toBeInTheDocument();
  });

  it("clears the dirty flag after a successful save", async () => {
    const onSaved = vi.fn();
    const savedCampaign = {
      ...initialCampaign,
      internalName: "九月深夜咖啡",
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ campaign: savedCampaign }, 201));
    render(<SponsorCampaignForm onSaved={onSaved} />);
    fillValidNewCampaign({ internalName: "九月深夜咖啡" });

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedCampaign));
    expect((window as AdminWindow).adminHasUnsavedChanges).toBe(false);
  });

  it("keeps entered values and dirty state when the campaign request fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "暂时无法保存这份业配。" }, 500)
    );
    render(<SponsorCampaignForm />);
    fillValidNewCampaign({ internalName: "不能丢失的夜间档期" });

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(
      await screen.findByText("暂时无法保存这份业配。")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("内部名称")).toHaveValue(
      "不能丢失的夜间档期"
    );
    expect((window as AdminWindow).adminHasUnsavedChanges).toBe(true);
  });

  it("cleanup-deletes only the newly uploaded path when the following save fails", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          path: newlyUploadedPath,
          publicUrl: `https://cdn.example/${newlyUploadedPath}`,
        }, 201)
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: "业配资料保存失败。" }, 500)
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(<SponsorCampaignForm initialCampaign={initialCampaign} />);
    selectHomeImage();
    fireEvent.change(screen.getByLabelText("居民首页宽幅替代文字"), {
      target: { value: "一杯放在木桌上的深夜咖啡" },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(await screen.findByText("业配资料保存失败。")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/admin/sponsors/upload"
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/admin/sponsors/${campaignId}`
    );
    expect(fetchMock.mock.calls[2]).toEqual([
      "/api/admin/sponsors/upload",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ path: newlyUploadedPath }),
      }),
    ]);
    expect(screen.getByLabelText("居民首页宽幅替代文字")).toHaveValue(
      "一杯放在木桌上的深夜咖啡"
    );
    expect((window as AdminWindow).adminHasUnsavedChanges).toBe(true);
  });

  it("never cleanup-deletes an existing saved placement path", async () => {
    const campaignWithSavedPlacement: SponsorCampaign = {
      ...initialCampaign,
      placements: [
        {
          placement: "home_wide",
          imagePath: existingPath,
          altText: "既有的咖啡合作照片",
          enabled: true,
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "业配资料保存失败。" }, 500)
    );
    render(<SponsorCampaignForm initialCampaign={campaignWithSavedPlacement} />);
    fireEvent.change(screen.getByLabelText("前台标题"), {
      target: { value: "仍然保留旧照片的标题" },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(await screen.findByText("业配资料保存失败。")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/api/admin/sponsors/${campaignId}`
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/admin/sponsors/upload",
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("SponsorStatsSummary", () => {
  it("switches among Today, 7 days, 30 days, and 3 months", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const range = new URL(String(input), "https://ourlittleage.test")
        .searchParams.get("range") as SponsorStatsRange;
      return Promise.resolve(jsonResponse(statsResponse(range)));
    });
    render(<SponsorStatsSummary />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/sponsors/stats?range=7d",
        expect.objectContaining({ cache: "no-store" })
      );
    });

    for (const [label, range] of [
      ["今日", "today"],
      ["30 天", "30d"],
      ["3 个月", "3m"],
      ["7 天", "7d"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/admin/sponsors/stats?range=${range}`,
          expect.objectContaining({ cache: "no-store" })
        );
      });
    }
  });
});

describe("SponsorSettingsPanel", () => {
  it("requires confirmation before enabling the default-off master switch", async () => {
    const enabledSettings = { ...defaultSettings, commercialEnabled: true };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ settings: enabledSettings })
    );
    render(<SponsorSettingsPanel initialSettings={defaultSettings} />);
    const masterSwitch = screen.getByRole("switch", {
      name: "商业合作总开关",
    });

    fireEvent.click(masterSwitch);

    expect(masterSwitch).not.toBeChecked();
    expect(
      await screen.findByRole("heading", { name: "启用商业合作？" })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "启用商业合作" })
    );

    await waitFor(() => expect(masterSwitch).toBeChecked());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/sponsors/settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(enabledSettings),
      })
    );
  });
});

function fillValidNewCampaign(
  overrides: Partial<{
    internalName: string;
    destinationUrl: string;
    startsAt: string;
    endsAt: string;
  }> = {}
) {
  const values = {
    internalName: "九月深夜咖啡",
    destinationUrl: "https://partner.example/september",
    startsAt: "2026-08-25T08:00",
    endsAt: "2026-09-01T08:00",
    ...overrides,
  };

  fireEvent.change(screen.getByLabelText("内部名称"), {
    target: { value: values.internalName },
  });
  fireEvent.change(screen.getByLabelText("合作方名称"), {
    target: { value: "月光咖啡社" },
  });
  fireEvent.change(screen.getByLabelText("前台标题"), {
    target: { value: "给今晚留一杯慢咖啡" },
  });
  fireEvent.change(screen.getByLabelText("简短说明"), {
    target: { value: "一份不打扰阅读的商业合作。" },
  });
  fireEvent.change(screen.getByLabelText("目标网址"), {
    target: { value: values.destinationUrl },
  });
  fireEvent.change(screen.getByLabelText("开始时间"), {
    target: { value: values.startsAt },
  });
  fireEvent.change(screen.getByLabelText("结束时间"), {
    target: { value: values.endsAt },
  });
}

function selectHomeImage() {
  fireEvent.click(
    screen.getByRole("switch", { name: "启用居民首页宽幅" })
  );
  fireEvent.change(screen.getByLabelText("居民首页宽幅照片"), {
    target: {
      files: [new File(["image"], "coffee.png", { type: "image/png" })],
    },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function statsResponse(range: SponsorStatsRange) {
  return {
    stats: {
      range,
      timezone: "Asia/Kuala_Lumpur",
      startDate: "2026-08-18",
      endDate: "2026-08-24",
      startAt: "2026-08-17T16:00:00.000Z",
      endAtExclusive: "2026-08-24T16:00:00.000Z",
      bucketUnit: range === "3m" ? "week" : "day",
      totals: { impressions: 0, clicks: 0, ctr: 0 },
      buckets: [],
      byCampaign: [],
      byPlacement: [],
    },
  };
}
