import { startAuthentication } from "@simplewebauthn/browser";
import { adminApiClient } from "@sylis/api-client/admin";
import { Button, Field, KeyRound, TextInput } from "@sylis/components";
import { useEffect, useRef, useState } from "react";

export interface AdminReauthenticationProps {
  onStatusChange: (verified: boolean) => void;
}

export function AdminReauthentication({
  onStatusChange,
}: AdminReauthenticationProps) {
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
    },
    [],
  );

  const markVerified = (validForSeconds: number) => {
    onStatusChange(true);
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    expiryTimer.current = setTimeout(
      () => onStatusChange(false),
      validForSeconds * 1_000,
    );
  };

  const run = async (method: "TOTP" | "WEBAUTHN") => {
    onStatusChange(false);
    setPending(true);
    setError(undefined);
    try {
      const challenge =
        await adminApiClient.auth.beginReauthentication(password);
      if (!challenge.methods.includes(method)) {
        throw new Error(`${method} 未配置`);
      }
      const response =
        method === "WEBAUTHN"
          ? await startAuthentication({
              optionsJSON: challenge.webAuthnOptions as Parameters<
                typeof startAuthentication
              >[0]["optionsJSON"],
            })
          : undefined;
      const result = await adminApiClient.auth.reauthenticate({
        challengeToken: challenge.challengeToken,
        method,
        code: method === "TOTP" ? totp : undefined,
        response,
      });
      markVerified(result.validForSeconds);
      setPassword("");
      setTotp("");
    } catch (cause) {
      onStatusChange(false);
      setError(cause instanceof Error ? cause.message : "重新认证失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="admin-reauthentication">
      <Field label="管理员密码" error={error}>
        <TextInput
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <Field label="TOTP" error={error}>
        <TextInput
          inputMode="numeric"
          maxLength={6}
          pattern="[0-9]{6}"
          value={totp}
          onChange={(event) => setTotp(event.target.value)}
        />
      </Field>
      <div className="row-actions">
        <Button
          icon={KeyRound}
          tone="secondary"
          disabled={!password || totp.length !== 6 || pending}
          onClick={() => void run("TOTP")}
        >
          TOTP 认证
        </Button>
        <Button
          icon={KeyRound}
          tone="secondary"
          disabled={!password || pending}
          onClick={() => void run("WEBAUTHN")}
        >
          Passkey 认证
        </Button>
      </div>
    </div>
  );
}
