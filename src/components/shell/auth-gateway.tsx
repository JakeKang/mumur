import type { FormEvent } from "react";
import type { AuthMode, LoginForm, RegisterForm } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AuthGatewayProps = {
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  busy: boolean;
  loginForm: LoginForm;
  setLoginForm: (updater: (prev: LoginForm) => LoginForm) => void;
  registerForm: RegisterForm;
  setRegisterForm: (updater: (prev: RegisterForm) => RegisterForm) => void;
  handleLogin: (event: FormEvent<HTMLFormElement>) => void;
  handleRegister: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
};

export function AuthGateway({
  authMode,
  setAuthMode,
  busy,
  loginForm,
  setLoginForm,
  registerForm,
  setRegisterForm,
  handleLogin,
  handleRegister,
  error
}: AuthGatewayProps) {
  return (
    <section className="grid gap-4 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-[var(--surface-strong)] to-[var(--background)] p-4 shadow-sm md:grid-cols-[1.2fr_1fr] md:p-6">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Mumur 시작하기</p>
        <h2 className="text-2xl font-semibold text-[var(--foreground)] md:text-3xl">아이디어를 팀의 실행 가능한 자산으로 성장시키세요.</h2>
        <p className="text-sm leading-6 text-[var(--muted)]">
          머머는 메모에서 끝나는 도구가 아니라, 상태 흐름(씨앗/발아/성장/결실/휴면)과 협업 기록을 중심으로 아이디어를 발전시키는
          워크스페이스입니다.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">실시간 협업 피드백</div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">버전/타임라인 추적</div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">상태 기반 우선순위</div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">Slack/Discord 연동</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{authMode === "login" ? "로그인" : "회원가입"}</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant={authMode === "login" ? "default" : "outline"} size="sm" onClick={() => setAuthMode("login")}>로그인</Button>
            <Button variant={authMode === "register" ? "default" : "outline"} size="sm" onClick={() => setAuthMode("register")}>회원가입</Button>
          </div>
          <p className="text-xs text-[var(--muted)]">테스트 계정: localtester@mumur.local / mumur1234!</p>
        </CardHeader>
        <CardContent>
          {authMode === "login" ? (
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
              <Button type="submit" disabled={busy}>로그인</Button>
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
                placeholder="팀 이름"
                value={registerForm.teamName}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, teamName: event.target.value }))}
                required
              />
              <Button type="submit" disabled={busy}>가입</Button>
            </form>
          )}
          {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}
