import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canManageFeedback,
  canManageSponsors,
  getAdminActor,
} from "./authorization";

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

type ProfileResult = {
  data: { role: string | null } | null;
  error: Error | null;
};

function mockServerClient({
  userId = "resident-1",
  userRole = "owner",
  profileResult = { data: { role: "admin" }, error: null },
}: {
  userId?: string | null;
  userRole?: string;
  profileResult?: ProfileResult;
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue(profileResult);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getUser = vi.fn().mockResolvedValue({
    data: {
      user: userId
        ? { id: userId, user_metadata: { role: userRole } }
        : null,
    },
    error: null,
  });

  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser },
    from,
  } as never);

  return { eq, from, getUser, select };
}

describe("canManageSponsors", () => {
  it.each([
    ["owner", true],
    ["admin", true],
    ["moderator", false],
    ["user", false],
    ["unknown", false],
    [null, false],
  ])("returns %s for role %s", (role, expected) => {
    expect(canManageSponsors(role)).toBe(expected);
  });
});

describe("canManageFeedback", () => {
  it.each([
    ["owner", true],
    ["admin", true],
    ["moderator", false],
    ["user", false],
    [null, false],
  ])("returns %s for role %s", (role, expected) => {
    expect(canManageFeedback(role)).toBe(expected);
  });
});

describe("getAdminActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when auth.getUser has no authenticated user", async () => {
    const { from, getUser } = mockServerClient({ userId: null });

    await expect(getAdminActor()).resolves.toBeNull();
    expect(getUser).toHaveBeenCalledOnce();
    expect(from).not.toHaveBeenCalled();
  });

  it("uses the profiles role instead of user metadata", async () => {
    const { eq, from, getUser, select } = mockServerClient({
      userId: "admin-1",
      userRole: "owner",
      profileResult: { data: { role: "admin" }, error: null },
    });

    await expect(getAdminActor()).resolves.toEqual({
      id: "admin-1",
      role: "admin",
    });
    expect(getUser).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("role");
    expect(eq).toHaveBeenCalledWith("id", "admin-1");
  });

  it("returns a null role when the authenticated user has no profile", async () => {
    mockServerClient({
      userId: "profile-missing",
      profileResult: { data: null, error: null },
    });

    await expect(getAdminActor()).resolves.toEqual({
      id: "profile-missing",
      role: null,
    });
  });

  it("surfaces profile lookup failures", async () => {
    const profileError = new Error("profile lookup failed");
    mockServerClient({
      profileResult: { data: null, error: profileError },
    });

    await expect(getAdminActor()).rejects.toBe(profileError);
  });

  it("validates a bearer token when browser auth is stored outside cookies", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { role: "owner" },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));

    vi.mocked(supabaseAdmin.auth.getUser).mockResolvedValue({
      data: { user: { id: "owner-1" } },
      error: null,
    } as never);
    vi.mocked(supabaseAdmin.from).mockReturnValue({ select } as never);

    const request = new Request("http://localhost/api/admin/feedback/id/status", {
      headers: { Authorization: "Bearer valid-access-token" },
    });

    await expect(getAdminActor(request)).resolves.toEqual({
      id: "owner-1",
      role: "owner",
    });
    expect(supabaseAdmin.auth.getUser).toHaveBeenCalledWith(
      "valid-access-token"
    );
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
