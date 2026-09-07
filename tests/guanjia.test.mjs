import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm, chmod, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER = join(ROOT, "项目模板", "scripts", "init-project.sh");
const POWERSHELL_INSTALLER = join(ROOT, "项目模板", "scripts", "init-project.ps1");
const CORE = join(ROOT, "项目模板", "guanjia", "bin", "guanjia.mjs");

async function run(command, args, cwd, expectExit = 0) {
  try {
    const result = await exec(command, args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    assert.equal(expectExit, 0, `${command} 应该失败但成功了`);
    return result;
  } catch (error) {
    assert.equal(error.code, expectExit, `${command} 退出码不符合预期：${error.stderr || error.message}`);
    return error;
  }
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function cli(project, args, expectExit = 0) {
  const result = await run("node", [CORE, ...args], project, expectExit);
  const output = result.stdout || "";
  return output.trim() ? JSON.parse(output) : null;
}

async function runHook(script, cwd, input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn("node", [script], { cwd, encoding: "utf8" });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => resolveResult({ code, signal, stdout, stderr }));
    child.stdin.end(`${JSON.stringify(input)}\n`);
  });
}

async function gitInit(project) {
  await run("git", ["init", "-q"], project);
  await run("git", ["config", "user.email", "test@example.com"], project);
  await run("git", ["config", "user.name", "Guanjia Test"], project);
}

test("安装保留原 AGENTS，特殊字符项目名不破坏资料，重复安装幂等", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-install-"));
  try {
    await writeFile(join(project, "AGENTS.md"), "用户原有规则\n不要覆盖我\n", "utf8");
    await mkdir(join(project, ".aiops"));
    await writeFile(join(project, ".aiops", "legacy.txt"), "legacy", "utf8");
    assert.match(await readFile(POWERSHELL_INSTALLER, "utf8"), /--project \$Project/);
    assert.match(await readFile(POWERSHELL_INSTALLER, "utf8"), /PSScriptRoot/);
    await run("sh", [INSTALLER, project, "A/B & R&D", "generic"], project);
    const agents = await readFile(join(project, "AGENTS.md"), "utf8");
    assert.match(agents, /用户原有规则/);
    assert.match(agents, /GUANJIA BEGIN/);
    assert.equal(await readFile(join(project, ".aiops", "legacy.txt"), "utf8"), "legacy");
    assert.match(await readFile(join(project, "guanjia", "bin", "guanjia.mjs"), "utf8"), /const STATIC_RESOURCE_PATHS/);
    assert.match(await readFile(join(project, "guanjia", "START.md"), "utf8"), /管家入口/);
    assert.match(await readFile(join(project, "guanjia", "guanjia.ps1"), "utf8"), /PSScriptRoot/);
    assert.match(await readFile(join(project, "guanjia", "guanjia.cmd"), "utf8"), /PROJECT_ROOT/);
    assert.match(await readFile(join(project, "guanjia", "guanjia.sh"), "utf8"), /PROJECT_ROOT/);
    const fromOutside = await run("sh", [join(project, "guanjia", "guanjia.sh"), "status", "--json"], tmpdir());
    const outsideStatus = JSON.parse(fromOutside.stdout);
    assert.equal(outsideStatus.project_id.length > 0, true);
    assert.equal(outsideStatus.project, project);
    const second = await run("sh", [INSTALLER, project, "A/B & R&D", "generic"], project);
    assert.equal(second.stdout.includes("管家已接入"), true);
    const repeated = await readFile(join(project, "AGENTS.md"), "utf8");
    assert.equal((repeated.match(/GUANJIA BEGIN/g) || []).length, 1);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("安装预检失败不会留下半套资料", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-install-preflight-"));
  try {
    await mkdir(join(project, "guanjia"));
    await writeFile(join(project, "guanjia", "config.json"), JSON.stringify({ schema_version: 1, project_id: "preflight-project", project_name: "预检", host: "generic", package_version: "0.1.0", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), validation: { commands: [] }, capabilities: { core: "verified", host_hooks: "unverified", submit_gate: "not_configured" } }), "utf8");
    await writeFile(join(project, "AGENTS.md"), "<!-- GUANJIA BEGIN -->\n缺少结束标记\n", "utf8");
    const result = await run("sh", [INSTALLER, project, "预检失败", "generic"], project, 4);
    assert.match(result.stderr, /受管区块不完整/);
    assert.equal(await exists(join(project, "guanjia", "state.json")), false);
    assert.equal(await exists(join(project, "guanjia", "bin", "guanjia.mjs")), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("安装事务遇到派生文件故障会回退已写入资源", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-install-rollback-"));
  try {
    await mkdir(join(project, "guanjia"));
    await writeFile(join(project, "guanjia", "config.json"), JSON.stringify({ schema_version: 1, project_id: "rollback-project", project_name: "回退", host: "generic", package_version: "0.1.0", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), validation: { commands: [] }, capabilities: { core: "verified", host_hooks: "unverified", submit_gate: "not_configured" } }), "utf8");
    await mkdir(join(project, "guanjia", "README.md"));
    const result = await run("sh", [INSTALLER, project, "回退失败", "generic"], project, 6);
    assert.match(result.stderr, /EISDIR|目录/);
    assert.equal(await exists(join(project, "guanjia", "state.json")), false);
    assert.equal(await exists(join(project, "guanjia", "bin", "guanjia.mjs")), false);
    assert.equal(await exists(join(project, "guanjia", "manifest.json")), false);
    assert.equal(await exists(join(project, "guanjia", "README.md")), true);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("交接、用户暂停和新会话恢复可观察且不会自动解除暂停", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-handoff-"));
  try {
    await run("sh", [INSTALLER, project, "交接测试", "generic"], project);
    const started = await cli(project, ["task", "start", "--input", JSON.stringify({ goal: "修复登录提示", allowed_paths: ["src/auth/**"], acceptance: ["错误凭据有明确提示"], reuse: [{ path: "src/auth/errors.js", decision: "extend", reason: "已有错误入口" }] }), "--json"]);
    assert.equal(started.ok, true);
    const checkpoint = await cli(project, ["checkpoint", "--input", JSON.stringify({ summary: "已定位错误映射入口", next_action: "补充行为测试", session_id: "session-a" }), "--json"]);
    const paused = await cli(project, ["task", "transition", "--input", JSON.stringify({ task_id: "T-001", status: "paused", pause_reason: "user", expected_revision: checkpoint.revision }), "--json"]);
    assert.equal(paused.task.status, "paused");
    const resumed = await cli(project, ["resume", "--json"]);
    assert.equal(resumed.action, "report_only");
    assert.match(resumed.reasons.join(" "), /用户仍处于暂停状态/);
    const handoff = await cli(project, ["handoff", "--json"]);
    assert.equal(handoff.handoff, true);
    const document = await readFile(join(project, "guanjia", "HANDOFF.md"), "utf8");
    assert.match(document, /补充行为测试/);
    assert.match(document, /暂停：是，用户明确暂停/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("暂存业务改动没有证据不能放行，验证证据必须绑定暂存快照", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-gate-"));
  try {
    await gitInit(project);
    await writeFile(join(project, "README.md"), "fixture\n", "utf8");
    await run("git", ["add", "README.md"], project);
    await run("git", ["commit", "-qm", "fixture"], project);
    await run("sh", [INSTALLER, project, "门禁测试", "generic"], project);
    await run("git", ["add", "guanjia", "AGENTS.md"], project);
    await run("git", ["commit", "-qm", "install guanjia"], project);
    await mkdir(join(project, "src"));
    await writeFile(join(project, "src", "a.txt"), "changed\n", "utf8");
    const started = await cli(project, ["task", "start", "--input", JSON.stringify({ goal: "修改 fixture", allowed_paths: ["src/**"], acceptance: ["文件内容更新"] }), "--json"]);
    await run("git", ["add", "src/a.txt", "guanjia/state.json", "guanjia/records/requests", "guanjia/README.md", "guanjia/HANDOFF.md"], project);
    const before = await cli(project, ["check", "--scope", "staged", "--json"], 5);
    assert.equal(before.result, "NOT_RUN");
    const verified = await cli(project, ["verify", "--input", JSON.stringify({ task_id: started.task.id, expected_revision: started.revision, command: { executable: "node", args: ["-e", "process.exit(0)"], timeout_ms: 10000 } }), "--json"]);
    assert.equal(verified.evidence.status, "PASS");
    await run("git", ["add", "guanjia/state.json", "guanjia/records/evidence", "guanjia/README.md", "guanjia/HANDOFF.md"], project);
    const after = await cli(project, ["check", "--scope", "staged", "--json"]);
    assert.equal(after.result, "PASS");
    const completed = await cli(project, ["task", "transition", "--input", JSON.stringify({ task_id: started.task.id, status: "completed", evidence_refs: [verified.evidence.evidence_id], expected_revision: verified.revision }), "--json"]);
    assert.equal(completed.task.status, "completed");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("验证失败或命令不存在不能产生 PASS", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-evidence-status-"));
  try {
    await gitInit(project);
    await writeFile(join(project, "README.md"), "fixture\n", "utf8");
    await run("git", ["add", "README.md"], project);
    await run("git", ["commit", "-qm", "fixture"], project);
    await run("sh", [INSTALLER, project, "证据状态", "generic"], project);
    await run("git", ["add", "guanjia", "AGENTS.md"], project);
    await run("git", ["commit", "-qm", "install guanjia"], project);
    const started = await cli(project, ["task", "start", "--input", JSON.stringify({ goal: "验证命令状态", allowed_paths: ["src/**"], acceptance: ["命令结果可解释"] }), "--json"]);
    const failed = await cli(project, ["verify", "--input", JSON.stringify({ task_id: started.task.id, expected_revision: started.revision, command: { executable: "node", args: ["-e", "process.exit(2)"], timeout_ms: 10000 } }), "--json"], 5);
    assert.equal(failed.evidence.status, "FAIL");
    const missing = await cli(project, ["verify", "--input", JSON.stringify({ task_id: started.task.id, expected_revision: failed.revision, command: { executable: "guanjia-command-that-does-not-exist", args: [], timeout_ms: 10000 } }), "--json"], 5);
    assert.equal(missing.evidence.status, "NOT_RUN");
    assert.equal(missing.evidence.exit_code, null);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("低风险纯文案任务可用轻量快照验证，代码改动不能借此放行", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-lightweight-"));
  try {
    await gitInit(project);
    await writeFile(join(project, "README.md"), "fixture\n", "utf8");
    await run("git", ["add", "README.md"], project);
    await run("git", ["commit", "-qm", "fixture"], project);
    await run("sh", [INSTALLER, project, "轻量验证", "generic"], project);
    await run("git", ["add", "guanjia", "AGENTS.md"], project);
    await run("git", ["commit", "-qm", "install guanjia"], project);
    await writeFile(join(project, "docs.md"), "说明更新\n", "utf8");
    await run("git", ["add", "docs.md"], project);
    const started = await cli(project, ["task", "start", "--input", JSON.stringify({ goal: "更新说明", risk: "low", allowed_paths: ["docs.md"], acceptance: ["说明清楚"] }), "--json"]);
    const verified = await cli(project, ["verify", "--input", JSON.stringify({ task_id: started.task.id, expected_revision: started.revision, mode: "lightweight" }), "--json"]);
    assert.equal(verified.evidence.status, "PASS");
    assert.equal(verified.evidence.verification.kind, "lightweight");
    const completed = await cli(project, ["task", "transition", "--input", JSON.stringify({ task_id: started.task.id, status: "completed", expected_revision: verified.revision, evidence_refs: [verified.evidence.evidence_id] }), "--json"]);
    assert.equal(completed.task.status, "completed");

    const codeProject = await mkdtemp(join(tmpdir(), "guanjia-lightweight-code-"));
    try {
      await gitInit(codeProject);
      await writeFile(join(codeProject, "README.md"), "fixture\n", "utf8");
      await run("git", ["add", "README.md"], codeProject);
      await run("git", ["commit", "-qm", "fixture"], codeProject);
      await run("sh", [INSTALLER, codeProject, "轻量代码拒绝", "generic"], codeProject);
      await run("git", ["add", "guanjia", "AGENTS.md"], codeProject);
      await run("git", ["commit", "-qm", "install guanjia"], codeProject);
      await writeFile(join(codeProject, "src.js"), "console.log('no');\n", "utf8");
      await run("git", ["add", "src.js"], codeProject);
      const codeTask = await cli(codeProject, ["task", "start", "--input", JSON.stringify({ goal: "修改代码", risk: "low", allowed_paths: ["src.js"], acceptance: ["代码可运行"] }), "--json"]);
      const rejected = await cli(codeProject, ["verify", "--input", JSON.stringify({ task_id: codeTask.task.id, expected_revision: codeTask.revision, mode: "lightweight" }), "--json"], 5);
      assert.equal(rejected.evidence.status, "FAIL");
    } finally {
      await rm(codeProject, { recursive: true, force: true });
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("提交检查接入会保留原 hook，不把配置存在冒充生效", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-hooks-"));
  try {
    await gitInit(project);
    await writeFile(join(project, "README.md"), "fixture\n", "utf8");
    await run("git", ["add", "README.md"], project);
    await run("git", ["commit", "-qm", "fixture"], project);
    await run("sh", [INSTALLER, project, "hook 测试", "generic"], project);
    await run("git", ["add", "guanjia", "AGENTS.md"], project);
    await run("git", ["commit", "-qm", "install guanjia"], project);
    const hooksDir = join(project, ".git", "hooks");
    const original = join(hooksDir, "pre-commit");
    await writeFile(original, "#!/bin/sh\necho ORIGINAL-HOOK\n", "utf8");
    await chmod(original, 0o755);
    const installed = await cli(project, ["hooks", "install", "--json"]);
    assert.equal(installed.status, "installed");
    assert.equal(await readFile(join(hooksDir, "pre-commit.guanjia-original"), "utf8"), "#!/bin/sh\necho ORIGINAL-HOOK\n");
    assert.match(await readFile(original, "utf8"), /GUANJIA PRE-COMMIT WRAPPER/);
    const doctor = await cli(project, ["doctor", "--json"]);
    assert.equal(doctor.checks.find((item) => item.id === "submit_gate").status, "pass");
    const uninstalled = await cli(project, ["hooks", "uninstall", "--json"]);
    assert.equal(uninstalled.status, "uninstalled");
    assert.equal(await readFile(original, "utf8"), "#!/bin/sh\necho ORIGINAL-HOOK\n");
    const after = await cli(project, ["doctor", "--json"]);
    assert.equal(after.checks.find((item) => item.id === "submit_gate").status, "warn");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("卸载发现用户改过管家 wrapper 时拒绝覆盖", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-hooks-conflict-"));
  try {
    await gitInit(project);
    await run("sh", [INSTALLER, project, "hook 冲突", "generic"], project);
    await run("git", ["add", "guanjia", "AGENTS.md"], project);
    await run("git", ["commit", "-qm", "install guanjia"], project);
    await cli(project, ["hooks", "install", "--json"]);
    const preCommit = join(project, ".git", "hooks", "pre-commit");
    await writeFile(preCommit, `${await readFile(preCommit, "utf8")}\n# user edit\n`, "utf8");
    const result = await cli(project, ["hooks", "uninstall", "--json"], 4);
    assert.match(result.error, /wrapper 已被用户修改/);
    assert.match(await readFile(preCommit, "utf8"), /user edit/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("宿主探针只有收到同 nonce 的真实回执才变为通过", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-probe-"));
  try {
    await run("sh", [INSTALLER, project, "探针测试", "zcode"], project);
    const nonce = "zcode-test-001";
    await cli(project, ["probe", "--host", "zcode", "--nonce", nonce, "--json"]);
    const before = await cli(project, ["doctor", "--json"]);
    assert.equal(before.checks.find((item) => item.id === "host_hooks").status, "unverified");
    const wrongHost = await cli(project, ["host-event", "--input", JSON.stringify({ nonce, event: "session_start", session_id: "wrong-host", host: "codex" }), "--json"], 4);
    assert.match(wrongHost.error, /host 不匹配/);
    const wrongEvent = await cli(project, ["host-event", "--input", JSON.stringify({ nonce, event: "not-a-real-event", session_id: "wrong-event", host: "zcode" }), "--json"], 4);
    assert.match(wrongEvent.error, /不在宿主契约/);
    await cli(project, ["host-event", "--input", JSON.stringify({ nonce, event: "session_start", session_id: "real-session-1", host: "zcode" }), "--json"]);
    const after = await cli(project, ["doctor", "--json"]);
    assert.equal(after.checks.find((item) => item.id === "host_hooks").status, "pass");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("ZCode/Codex 薄适配器只注入当前项目短上下文，未接入项目不写入", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-adapter-"));
  try {
    await run("sh", [INSTALLER, project, "适配器测试", "zcode"], project);
    const zcodeHook = join(project, "guanjia", "adapters", "zcode-marketplace", "plugins", "guanjia", "hooks", "guanjia-hook.mjs");
    const codexHook = join(project, "guanjia", "adapters", "codex", "hook.mjs");
    const zcode = await runHook(zcodeHook, project, { cwd: project, hook_event_name: "SessionStart", session_id: "zcode-session-1", prompt: "do-not-persist-this" });
    assert.equal(zcode.code, 0);
    const zcodePayload = JSON.parse(zcode.stdout);
    assert.equal(zcodePayload.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(zcodePayload.hookSpecificOutput.additionalContext, /状态版本/);
    const codex = await runHook(codexHook, project, { cwd: project, hook_event_name: "SessionStart", session_id: "codex-session-1" });
    assert.equal(codex.code, 0);
    assert.match(JSON.parse(codex.stdout).hookSpecificOutput.additionalContext, /管家恢复上下文/);
    const events = (await readdir(join(project, "guanjia", "records", "events"))).filter((name) => name.endsWith(".json"));
    assert.equal(events.length, 2);
    const firstEvent = JSON.parse(await readFile(join(project, "guanjia", "records", "events", events[0]), "utf8"));
    assert.equal(firstEvent.prompt, undefined);
    assert.equal(firstEvent.session_id, "zcode-session-1");
    const state = JSON.parse(await readFile(join(project, "guanjia", "state.json"), "utf8"));
    assert.equal(state.session.host, "codex");
    assert.equal(state.session.host_session_id, "codex-session-1");
    const foreign = await mkdtemp(join(tmpdir(), "guanjia-foreign-"));
    try {
      const before = await readFile(join(project, "guanjia", "state.json"), "utf8");
      const result = await runHook(codexHook, foreign, { cwd: foreign, hook_event_name: "SessionStart", session_id: "foreign-session" });
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "");
      assert.equal(await readFile(join(project, "guanjia", "state.json"), "utf8"), before);
    } finally {
      await rm(foreign, { recursive: true, force: true });
    }
    const marketplace = JSON.parse(await readFile(join(project, "guanjia", "adapters", "zcode-marketplace", "marketplace.json"), "utf8"));
    assert.equal(marketplace.plugins[0].name, "guanjia");
    const codexHooks = JSON.parse(await readFile(join(project, "guanjia", "adapters", "codex", "project-hooks.json"), "utf8"));
    assert.ok(codexHooks.hooks.SessionStart);
    assert.ok(codexHooks.hooks.PostCompact);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("旧 .aiops 迁移先 dry-run，apply 后保留源目录并可识别冲突", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-migrate-"));
  try {
    await run("sh", [INSTALLER, project, "迁移测试", "generic"], project);
    await mkdir(join(project, ".aiops", "docs", "decisions"), { recursive: true });
    await writeFile(join(project, ".aiops", "docs", "PROGRESS.md"), "# 进度\n> 当前授权模式：基础放权\n续跑入口：先读旧现场\n", "utf8");
    await writeFile(join(project, ".aiops", "docs", "decisions", "ADR-001.md"), "# 历史决定\n", "utf8");
    const dryRun = await cli(project, ["migrate", "--from", "aiops", "--json"]);
    assert.equal(dryRun.status, "dry_run");
    assert.equal(await readFile(join(project, ".aiops", "docs", "decisions", "ADR-001.md"), "utf8"), "# 历史决定\n");
    const applied = await cli(project, ["migrate", "--from", "aiops", "--apply", "--json"]);
    assert.equal(applied.status, "applied");
    assert.equal(applied.mapped_policy, "standard");
    assert.equal(await readFile(join(project, "guanjia", "archive", "legacy-aiops", "docs", "decisions", "ADR-001.md"), "utf8"), "# 历史决定\n");
    assert.equal(await readFile(join(project, ".aiops", "docs", "decisions", "ADR-001.md"), "utf8"), "# 历史决定\n");
    const second = await cli(project, ["migrate", "--from", "aiops", "--apply", "--json"], 4);
    assert.equal(second.status, "conflict");
    const uninstall = await cli(project, ["uninstall", "--dry-run", "--json"]);
    assert.equal(uninstall.status, "dry_run_only");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("迁移遇到未知政策或目标写入故障时只返回冲突并回退本次变化", async () => {
  const unknown = await mkdtemp(join(tmpdir(), "guanjia-migrate-policy-"));
  try {
    await run("sh", [INSTALLER, unknown, "未知政策", "generic"], unknown);
    await mkdir(join(unknown, ".aiops", "docs"), { recursive: true });
    await writeFile(join(unknown, ".aiops", "docs", "PROGRESS.md"), "当前授权模式：自定义无限放权\n", "utf8");
    const before = await readFile(join(unknown, "guanjia", "state.json"), "utf8");
    const result = await cli(unknown, ["migrate", "--from", "aiops", "--apply", "--json"], 4);
    assert.equal(result.status, "conflict");
    assert.equal(result.inventory.policy_conflict, true);
    assert.equal(await readFile(join(unknown, "guanjia", "state.json"), "utf8"), before);
    assert.equal(await exists(join(unknown, "guanjia", "archive")), false);
  } finally {
    await rm(unknown, { recursive: true, force: true });
  }

  const blocked = await mkdtemp(join(tmpdir(), "guanjia-migrate-rollback-"));
  try {
    await run("sh", [INSTALLER, blocked, "迁移回退", "generic"], blocked);
    await mkdir(join(blocked, ".aiops", "docs"), { recursive: true });
    await writeFile(join(blocked, ".aiops", "docs", "PROGRESS.md"), "当前授权模式：基础放权\n", "utf8");
    await writeFile(join(blocked, ".aiops", "docs", "legacy.md"), "legacy\n", "utf8");
    await writeFile(join(blocked, "guanjia", "archive"), "not-a-directory\n", "utf8");
    const before = await readFile(join(blocked, "guanjia", "state.json"), "utf8");
    const result = await cli(blocked, ["migrate", "--from", "aiops", "--apply", "--json"], 6);
    assert.equal(result.ok, false);
    assert.equal(await readFile(join(blocked, "guanjia", "state.json"), "utf8"), before);
    assert.equal(await readFile(join(blocked, "guanjia", "archive"), "utf8"), "not-a-directory\n");
    assert.deepEqual(await readdir(join(blocked, "guanjia", "runtime", "migration-staging")), []);
  } finally {
    await rm(blocked, { recursive: true, force: true });
  }
});

test("没有任务契约的业务暂存改动不能假绿", async () => {
  const project = await mkdtemp(join(tmpdir(), "guanjia-no-task-"));
  try {
    await gitInit(project);
    await writeFile(join(project, "README.md"), "fixture\n", "utf8");
    await run("git", ["add", "README.md"], project);
    await run("git", ["commit", "-qm", "fixture"], project);
    await run("sh", [INSTALLER, project, "无任务门禁", "generic"], project);
    await run("git", ["add", "guanjia", "AGENTS.md"], project);
    await run("git", ["commit", "-qm", "install guanjia"], project);
    await mkdir(join(project, "src"));
    await writeFile(join(project, "src", "change.txt"), "changed\n", "utf8");
    await run("git", ["add", "src/change.txt"], project);
    const result = await cli(project, ["check", "--scope", "staged", "--json"], 5);
    assert.equal(result.result, "NOT_RUN");
    assert.match(result.reason, /没有当前任务契约/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("状态锁冲突和换分支恢复都进入可诊断路径", async () => {
  const locked = await mkdtemp(join(tmpdir(), "guanjia-lock-"));
  try {
    await run("sh", [INSTALLER, locked, "锁测试", "generic"], locked);
    await writeFile(join(locked, "guanjia", "runtime", "state.lock"), "{\"pid\":999\}\n", "utf8");
    const checkpoint = await cli(locked, ["checkpoint", "--input", JSON.stringify({ summary: "不会写入" }), "--json"], 4);
    assert.equal(checkpoint.ok, false);
    assert.equal(checkpoint.code, 4);
  } finally {
    await rm(locked, { recursive: true, force: true });
  }

  const switched = await mkdtemp(join(tmpdir(), "guanjia-branch-"));
  try {
    await gitInit(switched);
    await writeFile(join(switched, "README.md"), "fixture\n", "utf8");
    await run("git", ["add", "README.md"], switched);
    await run("git", ["commit", "-qm", "fixture"], switched);
    await run("sh", [INSTALLER, switched, "换分支测试", "generic"], switched);
    await run("git", ["add", "guanjia", "AGENTS.md"], switched);
    await run("git", ["commit", "-qm", "install guanjia"], switched);
    await run("git", ["switch", "-c", "changed"], switched);
    const resumed = await cli(switched, ["resume", "--json"]);
    assert.equal(resumed.action, "needs_review");
    assert.match(resumed.reasons.join(" "), /分支已变化/);
  } finally {
    await rm(switched, { recursive: true, force: true });
  }
});
