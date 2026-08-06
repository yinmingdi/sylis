import { startAuthentication } from "@simplewebauthn/browser";
import { Button, Field, KeyRound, TextInput } from "@sylis/components";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { adminIdentityCommands } from "../../modules/identity";

export function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [code, setCode] = useState("");
  const [options, setOptions] = useState<unknown | null>(null);
  const [error, setError] = useState<string>();
  const navigate = useNavigate();
  const finish = async (input: {
    method: "TOTP" | "WEBAUTHN";
    code?: string;
    response?: unknown;
  }) => {
    await adminIdentityCommands.login({ challengeToken: token, ...input });
    navigate("/", { replace: true });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    try {
      if (!token) {
        const challenge = await adminIdentityCommands.challenge(
          email,
          password,
        );
        setToken(challenge.challengeToken);
        setOptions(challenge.webAuthnOptions);
        return;
      }
      await finish({ method: "TOTP", code });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    }
  };
  const usePasskey = async () => {
    setError(undefined);
    try {
      const response = await startAuthentication({
        optionsJSON: options as Parameters<
          typeof startAuthentication
        >[0]["optionsJSON"],
      });
      await finish({ method: "WEBAUTHN", response });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Passkey 验证失败");
    }
  };
  return (
    <main className="admin-auth">
      <form onSubmit={submit}>
        <div className="admin-auth__mark">
          <KeyRound />
        </div>
        <h1>Sylis Admin</h1>
        {!token ? (
          <>
            <Field label="邮箱">
              <TextInput
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="密码" error={error}>
              <TextInput
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="TOTP 验证码" error={error}>
              <TextInput
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </Field>
            {options ? (
              <Button type="button" tone="secondary" onClick={usePasskey}>
                使用 Passkey
              </Button>
            ) : null}
          </>
        )}
        <Button type="submit" disabled={Boolean(token) && code.length !== 6}>
          {token ? "验证并登录" : "继续"}
        </Button>
      </form>
    </main>
  );
}
