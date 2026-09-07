#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findProjectRoot(start) {
  let current = resolve(start || process.cwd());
  while (true) {
    if (existsSync(join(current, "guanjia", "config.json")) && existsSync(join(current, "guanjia", "state.json"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function readInput() {
  let raw = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) raw += chunk;
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

function runCore(root, input) {
  return new Promise((done) => {
    const core = join(root, "guanjia", "bin", "guanjia.mjs");
    const child = spawn(process.env.NODE || "node", [core, "context", "--project", root, "--event", input.hook_event_name || "manual", "--session", input.session_id || "", "--host", "codex", "--record-event", "--json"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => done({ ok: false, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => done({ ok: code === 0, stdout, stderr }));
  });
}

function compactContext(payload) {
  const task = payload.task;
  return [
    `管家恢复上下文：项目 ${payload.project_id}，状态版本 ${payload.revision}。`,
    `任务：${task ? `${task.id} / ${task.status} / ${task.goal}` : "当前没有活跃任务"}。`,
    `授权：${payload.authority?.paused_by_user ? "用户已暂停，只汇报不执行写任务" : `范围 ${payload.authority?.scope?.join("、") || "未限定"}`}。`,
    `下一步：${task?.next_action || "等待用户提出任务"}。`,
    payload.instructions || "先核对现场，再按当前任务范围工作。",
  ].join("\n").slice(0, 5000);
}

const input = await readInput();
const root = findProjectRoot(input.cwd);
if (!root) process.exit(0);
const result = await runCore(root, input);
if (!result.ok) {
  process.stderr.write(`[guanjia] ${result.stderr || "context failed"}\n`);
  process.exit(0);
}
try {
  const payload = JSON.parse(result.stdout);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext: compactContext(payload) } }));
} catch (error) {
  process.stderr.write(`[guanjia] invalid core output: ${error.message}\n`);
}
