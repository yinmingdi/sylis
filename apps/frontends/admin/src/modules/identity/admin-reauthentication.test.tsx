import { adminApiClient } from "@sylis/api-client/admin";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AdminReauthentication } from "./admin-reauthentication";

describe("AdminReauthentication", () => {
  it("requires and submits the administrator password with the TOTP factor", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminApiClient.auth, "beginReauthentication").mockResolvedValue({
      challengeToken: "challenge-token",
      methods: ["TOTP"],
      webAuthnOptions: null,
    });
    vi.spyOn(adminApiClient.auth, "reauthenticate").mockResolvedValue({
      reauthenticatedAt: new Date().toISOString(),
      validForSeconds: 300,
    });
    const onStatusChange = vi.fn();
    render(<AdminReauthentication onStatusChange={onStatusChange} />);

    const submit = screen.getByRole("button", { name: "TOTP 认证" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText("管理员密码"), "admin-password");
    await user.type(screen.getByLabelText("TOTP"), "123456");
    await user.click(submit);

    expect(adminApiClient.auth.beginReauthentication).toHaveBeenCalledWith(
      "admin-password",
    );
    expect(adminApiClient.auth.reauthenticate).toHaveBeenCalledWith({
      challengeToken: "challenge-token",
      method: "TOTP",
      code: "123456",
      response: undefined,
    });
    expect(onStatusChange).toHaveBeenCalledWith(true);
  });

  it("closes an existing authorization window while a new verification is pending", async () => {
    const user = userEvent.setup();
    let completeReauthentication!: (value: {
      reauthenticatedAt: string;
      validForSeconds: number;
    }) => void;
    vi.spyOn(adminApiClient.auth, "beginReauthentication").mockResolvedValue({
      challengeToken: "challenge-token",
      methods: ["TOTP"],
      webAuthnOptions: null,
    });
    vi.spyOn(adminApiClient.auth, "reauthenticate").mockReturnValue(
      new Promise((resolve) => {
        completeReauthentication = resolve;
      }),
    );
    const onStatusChange = vi.fn();
    onStatusChange(true);
    render(<AdminReauthentication onStatusChange={onStatusChange} />);

    await user.type(screen.getByLabelText("管理员密码"), "admin-password");
    await user.type(screen.getByLabelText("TOTP"), "123456");
    await user.click(screen.getByRole("button", { name: "TOTP 认证" }));

    expect(onStatusChange).toHaveBeenLastCalledWith(false);

    completeReauthentication({
      reauthenticatedAt: new Date().toISOString(),
      validForSeconds: 300,
    });
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(true));
  });
});
