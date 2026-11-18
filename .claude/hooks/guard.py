"""Claude Code PreToolUse 훅 — CLAUDE.md 의 git 규칙을 자동으로 지키게 한다 (Bash·PowerShell 명령)

1) git commit 메시지에 Co-Authored-By 줄 → 막음 ("커밋에 Claude 서명 줄 없음")
2) git commit 전 → check.py 정적 검사(브라우저 없이 몇 초)에서 NG 가 있으면 막음
3) git push 전 → origin/main 을 받아 와서 HEAD 가 그 위에 있지 않으면 막음 ("push 전 git pull --rebase origin main")

막을 때는 이유를 Claude 에게 돌려준다. 이 훅이 직접 커밋·push 를 하지는 않는다.
"""
import json, re, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                             "permissionDecisionReason": reason}}))
    sys.exit(0)


def git(*args):
    return subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, encoding="utf-8", errors="replace")


def static_check():
    """check.py 를 main() 없이 읽어서 맨 위 정적 검사(ok(...) 행)만 얻는다"""
    code = ("import json,runpy,sys; ns=runpy.run_path(sys.argv[1], run_name='guard_hook'); "
            "print('@@ROWS@@'+json.dumps([r for r in ns['rows'] if r[0]=='NG'], ensure_ascii=True))")
    p = subprocess.run([sys.executable, "-c", code, str(REPO / "scripts/verify/check.py")], capture_output=True,
                       text=True, encoding="utf-8", errors="replace", cwd=REPO,
                       env={**__import__("os").environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"})
    out = p.stdout.rpartition("@@ROWS@@")[2].strip()
    if p.returncode != 0 or not out:  # check.py 자체가 깨졌으면 커밋도 막는다
        return [f"check.py 를 읽다가 오류: {p.stderr.strip()[-300:]}"]
    return [f"{n} → {g}" for st, n, g in json.loads(out)]


def main():
    data = json.loads(sys.stdin.buffer.read().decode("utf-8") or "{}")
    cmd = (data.get("tool_input") or {}).get("command") or ""
    # 명령 자리(줄 처음 · ; && || | ( 뒤)에 오는 git 만 본다 → echo·heredoc 글 속 "git commit" 은 무시
    at_cmd = r"(?:^|[;&|(\n])\s*(?:cd\s+\S+\s*(?:&&|;)\s*)?git(?:\s+-C\s+\S+)?\s+"
    is_commit = re.search(at_cmd + r"commit\b", cmd)
    is_push = re.search(at_cmd + r"push\b", cmd)
    if not (is_commit or is_push):
        return

    if is_commit:
        if re.search(r"co-authored-by\s*:", cmd, re.I):  # 서명 줄 형식만 (메시지 속 낱말은 통과)
            deny("이 프로젝트는 커밋에 Claude 서명 줄을 넣지 않는다 (CLAUDE.md). 커밋 메시지에서 Co-Authored-By 줄을 빼고 다시 커밋하라.")
        bad = static_check()
        if bad:
            deny("check.py 정적 검사 NG — 고친 뒤 커밋하라:\n- " + "\n- ".join(bad[:10]))

    if is_push:
        f = git("fetch", "--quiet", "origin", "main")
        if f.returncode != 0:
            deny("git fetch origin main 실패 — 네트워크를 확인한 뒤 git pull --rebase origin main 하고 push 하라.\n" + f.stderr.strip()[:300])
        if git("merge-base", "--is-ancestor", "origin/main", "HEAD").returncode != 0:
            deny("origin/main 에 새 커밋이 있다 (Actions 공고 피드 등). 먼저 git pull --rebase origin main 을 하고 다시 push 하라 (CLAUDE.md).")


if __name__ == "__main__":
    main()
