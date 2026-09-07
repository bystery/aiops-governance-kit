import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INSTALLER = join(ROOT, "项目模板", "scripts", "init-project.sh");
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

async function cli(project, args, expectExit = 0) {
  const result = await run("node", [CORE, ...args], project, expectExit);
  const output = result.stdout || "";
  return output.trim() ? JSON.parse(output) : null;
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
    await run("sh", [INSTALLER, project, "A/B & R&D", "generic"], project);
    const agents = await readFile(join(project, "AGENTS.md"), "utf8");
    assert.match(agents, /用户原有规则/);
    assert.match(agents, /GUANJIA BEGIN/);
    assert.equal(await readFile(join(project, ".aiops", "legacy.txt"), "utf8"), "legacy");
    assert.match(await readFile(join(project, "guanjia", "START.md"), "utf8"), /管家入口/);
    const second = await run("sh", [INSTALLER, project, "A/B & R&D", "generic"], project);
    assert.equal(second.stdout.includes("管家已接入"), true);
    const repeated = await readFile(join(project, "AGENTS.md"), "utf8");
    assert.equal((repeated.match(/GUANJIA BEGIN/g) || []).length, 1);
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
