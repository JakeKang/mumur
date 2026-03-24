"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { useApiClient } from "@/shared/hooks/use-api-client";

export default function LoginPage() {
  const api = useApiClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", teamName: "" });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await api("/api/auth/me");
        if (!cancelled) {
          window.location.replace("/");
        }
      } catch {
        if (!cancelled) {
          setChecked(true);
        }
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm)
      });
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(registerForm)
      });
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입에 실패했습니다");
    } finally {
      setBusy(false);
    }
  };

  if (!checked) {
    return <main className="min-h-screen bg-[var(--background)] p-8 text-sm text-[var(--muted)]">세션을 확인하는 중입니다...</main>;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <div className="pointer-events-none absolute -left-24 top-[-8rem] h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute right-[-6rem] top-20 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-5 py-10 md:grid-cols-[1.1fr_0.9fr] md:px-10">
        <section className="space-y-5">
          <p className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs tracking-wide text-[var(--muted)]">
            Mumur Workspace
          </p>
          <h1 className="text-3xl font-semibold leading-tight md:text-5xl">아이디어를 모으는 것에서 끝내지 말고, 실행 가능한 자산으로 만드세요.</h1>
          <p className="max-w-xl text-sm leading-7 text-[var(--muted)]">
            머머는 워크스페이스 기반 협업 편집기로, 아이디어의 생성부터 검토, 실행 전환까지 팀 흐름 안에서 연결합니다.
          </p>
          <div className="grid gap-2 text-sm text-[var(--muted)] md:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">블록 기반 문서 편집</div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">타임라인/복원 이력</div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">워크스페이스 단위 권한</div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">오프라인 우선 저장</div>
          </div>
        </section>

        <Card className="border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
          <CardHeader className="space-y-3">
            <CardTitle>{mode === "login" ? "로그인" : "회원가입"}</CardTitle>
            <div className="inline-flex w-fit items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-1">
              <Button size="sm" variant={mode === "login" ? "default" : "outline"} onClick={() => setMode("login")}>
                로그인
              </Button>
              <Button size="sm" variant={mode === "register" ? "default" : "outline"} onClick={() => setMode("register")}>
                회원가입
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {mode === "login" ? (
              <form className="grid gap-3" onSubmit={handleLogin}>
                <Input
                  type="email"
                  placeholder="이메일"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
                <Input
                  type="password"
                  placeholder="비밀번호"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
                <Button type="submit" disabled={busy}>
                  로그인
                </Button>
              </form>
            ) : (
              <form className="grid gap-3" onSubmit={handleRegister}>
                <Input
                  placeholder="이름"
                  value={registerForm.name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                />
                <Input
                  type="email"
                  placeholder="이메일"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
                <Input
                  type="password"
                  placeholder="비밀번호"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                  minLength={6}
                  required
                />
                <Input
                  placeholder="워크스페이스 이름"
                  value={registerForm.teamName}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, teamName: event.target.value }))}
                  required
                />
                <Button type="submit" disabled={busy}>
                  회원가입
                </Button>
              </form>
            )}
            {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
