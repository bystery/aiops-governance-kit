#!/usr/bin/env node

/**
 * 管家最小可恢复核心。
 *
 * 设计约束：只用 Node.js 标准库；状态通过原子写入落盘；模型负责语义摘要，
 * 程序负责状态转换、现场核对、证据绑定和交接单生成。宿主接入层不应复制这里的状态逻辑。
 */
import { createHash, randomUUID } from "node:crypto";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { promisify } from "node:util";
import { dirname, basename, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const execFile = promisify(execFileCallback);
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const RESOURCE_ROOT = resolve(THIS_DIR, "..");
const SCHEMA_VERSION = 1;
const MANAGED_BEGIN = "<!-- GUANJIA BEGIN -->";
const MANAGED_END = "<!-- GUANJIA END -->";
const META_PATHS = [
  "guanjia/state.json",
  "guanjia/README.md",
  "guanjia/HANDOFF.md",
  "guanjia/records/evidence/",
  "guanjia/records/requests/",
  "guanjia/records/events/",
];

const EXIT = {
  OK: 0,
  INPUT: 2,
  CAPABILITY: 3,
  CONFLICT: 4,
  CHECK: 5,
  ENVIRONMENT: 6,
};

class GuanjiaError extends Error {
  constructor(message, code = EXIT.ENVIRONMENT, details = undefined) {
    super(message);
    this.name = "GuanjiaError";
    this.code = code;
    this.details = details;
  }
}

function now() {
  return new Date().toISOString();
}

function json(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function hashText(value) {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}

async function exists(path) {
  try {
    await fs.access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path) {
  try {
    return (await fs.stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readText(path) {
  return fs.readFile(path, "utf8");
}

async function readJson(path, label = path) {
  try {
    return JSON.parse(await readText(path));
  } catch (error) {
    throw new GuanjiaError(`${label} 不是有效 JSON：${error.message}`, EXIT.CAPABILITY);
  }
}

async function writeAtomic(path, content) {
  await fs.mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await fs.open(temp, "w", 0o644);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temp, path);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

async function writeJsonAtomic(path, value) {
  return writeAtomic(path, json(value));
}

async function copyIfAbsent(source, target) {
  if (await exists(target)) {
    const [expected, actual] = await Promise.all([readText(source), readText(target)]);
    if (expected !== actual) {
      throw new GuanjiaError(`受管文件已被修改，拒绝覆盖：${target}`, EXIT.CONFLICT);
    }
    return false;
  }
  await fs.mkdir(dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  return true;
}

async function sha256File(path) {
  return hashText(await readText(path));
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }
    const equal = item.indexOf("=");
    if (equal >= 0) {
      options[item.slice(2, equal)] = item.slice(equal + 1);
      continue;
    }
    const key = item.slice(2);
    if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
      options[key] = argv[i + 1];
      i += 1;
    } else {
      options[key] = true;
    }
  }
  return { positional, options };
}

function required(options, key) {
  const value = options[key];
  if (value === undefined || value === "") {
    throw new GuanjiaError(`缺少参数 --${key}`, EXIT.INPUT);
  }
  return value;
}

async function loadProject(projectDir) {
  const root = resolve(projectDir || process.cwd());
  const guanjia = join(root, "guanjia");
  const configPath = join(guanjia, "config.json");
  const statePath = join(guanjia, "state.json");
  if (!(await exists(configPath)) || !(await exists(statePath))) {
    throw new GuanjiaError(`当前目录还没有管家资料：${guanjia}，请先运行 init。`, EXIT.CAPABILITY);
  }
  const config = await readJson(configPath, "guanjia/config.json");
  const state = await readJson(statePath, "guanjia/state.json");
  if (config.schema_version !== SCHEMA_VERSION || state.schema_version !== SCHEMA_VERSION) {
    throw new GuanjiaError("管家状态版本不匹配，请先运行迁移或使用匹配版本。", EXIT.CONFLICT);
  }
  return { root, guanjia, config, state, configPath, statePath };
}

async function git(root, args, timeout = 10000) {
  try {
    const result = await execFile("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return result.stdout.replace(/\r\n/g, "\n").trimEnd();
  } catch (error) {
    const message = `${error.stdout || ""}${error.stderr || ""}`.trim();
    throw new GuanjiaError(message || `git ${args.join(" ")} 执行失败`, EXIT.ENVIRONMENT);
  }
}

async function gitInfo(root) {
  try {
    await git(root, ["rev-parse", "--git-dir"]);
  } catch {
    return { available: false, branch: null, head: null, dirty: false, status: "not-a-repository" };
  }
  const [branch, head, status] = await Promise.all([
    git(root, ["branch", "--show-current"]).catch(() => ""),
    git(root, ["rev-parse", "HEAD"]).catch(() => ""),
    git(root, ["status", "--porcelain=v1"]).catch(() => ""),
  ]);
  return {
    available: true,
    branch: branch || null,
    head: head || null,
    dirty: Boolean(status),
    status,
  };
}

function isMetaPath(path) {
  return META_PATHS.some((prefix) => prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix);
}

async function stagedPaths(root) {
  try {
    const output = await git(root, ["diff", "--cached", "--name-only", "-z"]);
    return output.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

async function stagedDigest(root) {
  const paths = await stagedPaths(root);
  const parts = [];
  for (const path of paths) {
    if (isMetaPath(path)) continue;
    let content = "";
    try {
      content = await git(root, ["show", `:${path}`], 10000);
    } catch {
      content = "<unreadable-staged-blob>";
    }
    parts.push(`${path}\0${content}`);
  }
  return hashText(parts.sort().join("\0"));
}

async function workspaceSnapshot(root) {
  const info = await gitInfo(root);
  if (!info.available) {
    return { branch: null, head: null, snapshot_digest: null, dirty: false, git_available: false };
  }
  return {
    branch: info.branch,
    head: info.head,
    snapshot_digest: hashText(`${info.branch || ""}\0${info.head || ""}\0${info.status}`),
    dirty: info.dirty,
    git_available: true,
  };
}

async function acquireLock(guanjia) {
  const lockPath = join(guanjia, "runtime", "state.lock");
  await fs.mkdir(dirname(lockPath), { recursive: true });
  try {
    const handle = await fs.open(lockPath, "wx");
    await handle.writeFile(json({ pid: process.pid, created_at: now() }), "utf8");
    await handle.close();
    return async () => fs.rm(lockPath, { force: true });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new GuanjiaError("当前项目的状态正在被另一个会话写入，请稍后重试。", EXIT.CONFLICT);
    }
    throw error;
  }
}

async function mutateState(project, expectedRevision, mutation) {
  const release = await acquireLock(project.guanjia);
  try {
    const current = await readJson(project.statePath, "guanjia/state.json");
    if (expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
      throw new GuanjiaError(`状态版本冲突：需要 ${expectedRevision}，实际为 ${current.revision}。`, EXIT.CONFLICT, { current });
    }
    const next = structuredClone(current);
    await mutation(next);
    next.schema_version = SCHEMA_VERSION;
    next.revision = current.revision + 1;
    next.updated_at = now();
    await writeJsonAtomic(`${project.statePath}.bak`, current);
    await writeJsonAtomic(project.statePath, next);
    return next;
  } finally {
    await release().catch(() => {});
  }
}

function bounded(value, limit = 256) {
  return value === undefined || value === null ? null : String(value).slice(0, limit);
}

async function recordContextEvent(project, input) {
  const eventId = `EV-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const event = bounded(input.event || "manual", 80);
  const host = bounded(input.host || project.config.host || "generic", 80);
  const sessionId = bounded(input.session_id, 256);
  const record = {
    schema_version: 1,
    event_id: eventId,
    project_id: project.config.project_id,
    host,
    event,
    session_id: sessionId,
    source: bounded(input.source || "host-adapter", 80),
    recorded_at: now(),
  };
  await writeJsonAtomic(join(project.guanjia, "records", "events", `${eventId}.json`), record);

  let next = project.state;
  const sessionChanged = sessionId && (project.state.session.host_session_id !== sessionId || project.state.session.host !== host);
  if (sessionChanged) {
    next = await mutateState(project, undefined, (state) => {
      state.session.host = host;
      state.session.host_session_id = sessionId;
      state.session.active = true;
    });
    const updated = await loadProject(project.root);
    await renderDerived(updated, next);
  }
  return { event_id: eventId, revision: next.revision, session_id: sessionId };
}

function initialState(config, snapshot) {
  return {
    schema_version: SCHEMA_VERSION,
    revision: 0,
    project_id: config.project_id,
    updated_at: now(),
    authority: {
      mode: "standard",
      scope: [],
      source_ref: null,
      paused_by_user: false,
    },
    session: {
      host: config.host,
      host_session_id: null,
      lease_epoch: 0,
      active: false,
    },
    task: null,
    workspace: snapshot,
    last_checkpoint: null,
  };
}

function managedBlock() {
  return `${MANAGED_BEGIN}\n## 管家入口\n- 每次开始或恢复任务前读取 guanjia/START.md。\n- 当前任务、授权、暂停状态和验证证据以 guanjia/state.json 为准。\n- 需要暂停、交接或继续时，调用管家命令；不要只在聊天里说“记住了”。\n- 管家不会因为换窗口自动解除用户暂停，也不会把模型自称“已完成”当作证据。\n${MANAGED_END}`;
}

async function mergeAgents(root) {
  const path = join(root, "AGENTS.md");
  const block = managedBlock();
  const original = await exists(path) ? await readText(path) : "";
  const hasBegin = original.includes(MANAGED_BEGIN);
  const hasEnd = original.includes(MANAGED_END);
  if (hasBegin !== hasEnd) {
    throw new GuanjiaError("AGENTS.md 的管家受管区块不完整，拒绝覆盖，请人工修复标记。", EXIT.CONFLICT);
  }
  const next = hasBegin
    ? original.replace(new RegExp(`${MANAGED_BEGIN}[\\s\\S]*?${MANAGED_END}`, "m"), block)
    : `${original ? original.replace(/\s*$/, "") + "\n\n" : ""}${block}\n`;
  let backupPath = null;
  if (original && original !== next) {
    backupPath = join(root, "guanjia", "runtime", "backups", `AGENTS.md.${Date.now()}.bak`);
    await fs.mkdir(dirname(backupPath), { recursive: true });
    await fs.copyFile(path, backupPath);
  }
  if (original !== next) await writeAtomic(path, next);
  return { path: "AGENTS.md", existed: Boolean(original), changed: original !== next, ...(backupPath ? { backup_path: backupPath } : {}) };
}

const STATIC_RESOURCE_PATHS = [
  "bin/guanjia.mjs",
  "START.md",
  "rules/core.md",
  "rules/worker.md",
  "templates/HANDOFF.md",
  "adapters/README.md",
  "adapters/generic/hooks.json",
  "adapters/zcode/hooks.json",
  "adapters/codex/hooks.json",
  "adapters/codex/project-hooks.json",
  "adapters/codex/hook.mjs",
  "adapters/qoder/hooks.json",
  "adapters/workbuddy/hooks.json",
  "adapters/zcode-marketplace/marketplace.json",
  "adapters/zcode-marketplace/plugins/guanjia/.zcode-plugin/plugin.json",
  "adapters/zcode-marketplace/plugins/guanjia/hooks/hooks.json",
  "adapters/zcode-marketplace/plugins/guanjia/hooks/guanjia-hook.mjs",
  "hooks/README.md",
  "guanjia.ps1",
  "guanjia.cmd",
  "guanjia.sh",
  "runtime/.gitignore",
  "records/requests/.gitkeep",
  "records/evidence/.gitkeep",
  "records/decisions/.gitkeep",
];

async function staticResources() {
  return Promise.all(STATIC_RESOURCE_PATHS.map(async (relativePath) => [relativePath, await readText(join(RESOURCE_ROOT, relativePath))]));
}

async function install(projectDir, name, host, dryRun) {
  const root = resolve(projectDir);
  if (!(await isDirectory(root))) await fs.mkdir(root, { recursive: true });
  const guanjia = join(root, "guanjia");
  const existing = await exists(guanjia);
  const hasConfig = await exists(join(guanjia, "config.json"));
  if (existing && !hasConfig) {
    throw new GuanjiaError(`${guanjia} 已存在但不是管家资料目录，拒绝覆盖。`, EXIT.CONFLICT);
  }
  const snapshot = await workspaceSnapshot(root);
  const projectName = name || basename(root);
  const configPath = join(guanjia, "config.json");
  const config = hasConfig ? await readJson(configPath, "guanjia/config.json") : {
    schema_version: SCHEMA_VERSION,
    project_id: randomUUID(),
    project_name: projectName,
    host: host || "generic",
    package_version: "0.1.0",
    created_at: now(),
    updated_at: now(),
    validation: { commands: [] },
    capabilities: { core: "verified", host_hooks: "unverified", submit_gate: "not_configured" },
  };
  const resources = await staticResources();
  const agentsPath = join(root, "AGENTS.md");
  const existingAgents = await exists(agentsPath) ? await readText(agentsPath) : "";
  if (existingAgents.includes(MANAGED_BEGIN) !== existingAgents.includes(MANAGED_END)) {
    throw new GuanjiaError("AGENTS.md 的管家受管区块不完整，拒绝在预检未通过时写入安装资料。", EXIT.CONFLICT);
  }
  for (const [relativePath, content] of resources) {
    const target = join(guanjia, relativePath);
    if (await exists(target) && await readText(target) !== content) {
      throw new GuanjiaError(`受管文件已被修改，拒绝覆盖：${target}`, EXIT.CONFLICT);
    }
  }
  if (await exists(join(guanjia, "state.json"))) await readJson(join(guanjia, "state.json"), "guanjia/state.json");
  const plan = {
    project: root,
    project_name: config.project_name,
    files: ["guanjia/config.json", "guanjia/state.json", "guanjia/START.md", "guanjia/HANDOFF.md", "guanjia/README.md", "guanjia/rules/*", "guanjia/templates/HANDOFF.md", "guanjia/records/*", "AGENTS.md"],
    preserves: ["已有 AGENTS.md 原文", "已有 .aiops/ 目录", "未跟踪业务文件"],
    warnings: [
      snapshot.git_available ? null : "未发现 Git 仓库；进度仍可保存，但版本备份和提交检查不可用。",
      await exists(join(root, ".aiops")) ? "发现旧 .aiops/，本次不删除、不自动迁移；可稍后运行迁移器。" : null,
    ].filter(Boolean),
  };
  if (dryRun) return { ok: true, dry_run: true, plan };

  const originals = new Map();
  const remember = async (path) => {
    if (originals.has(path)) return;
    originals.set(path, await exists(path) ? await readText(path) : null);
  };
  const restore = async () => {
    const failures = [];
    for (const [path, original] of [...originals.entries()].reverse()) {
      try {
        if (original === null) await fs.rm(path, { force: true });
        else await writeAtomic(path, original);
      } catch (error) {
        failures.push(`${path}: ${error.message}`);
      }
    }
    return failures;
  };
  const generatedBackups = [];
  try {
    await fs.mkdir(guanjia, { recursive: true });
    await fs.mkdir(join(guanjia, "runtime", "backups"), { recursive: true });
    if (!hasConfig) {
      await remember(configPath);
      await writeJsonAtomic(configPath, config);
    }
    const statePath = join(guanjia, "state.json");
    if (!(await exists(statePath))) {
      await remember(statePath);
      await writeJsonAtomic(statePath, initialState(config, snapshot));
    }
    for (const [relativePath, content] of resources) {
      const target = join(guanjia, relativePath);
      if (!(await exists(target))) {
        await remember(target);
        await writeAtomic(target, content);
      }
    }
    await remember(join(guanjia, "README.md"));
    await remember(join(guanjia, "HANDOFF.md"));
    const project = await loadProject(root);
    await renderDerived(project, project.state);
    await remember(agentsPath);
    const agentResult = await mergeAgents(root);
    if (agentResult.backup_path) generatedBackups.push(agentResult.backup_path);
    const managed = [];
    for (const [relativePath] of resources) managed.push(`guanjia/${relativePath}`);
    const manifestPath = join(guanjia, "manifest.json");
    await remember(manifestPath);
    const manifest = { schema_version: 1, package_version: config.package_version, generated_at: now(), files: {} };
    for (const path of managed) manifest.files[path] = await sha256File(join(root, path));
    await writeJsonAtomic(manifestPath, manifest);
    return { ok: true, dry_run: false, plan, project_id: config.project_id, snapshot };
  } catch (error) {
    for (const backup of generatedBackups) await fs.rm(backup, { force: true }).catch(() => {});
    const rollbackFailures = await restore();
    if (rollbackFailures.length) {
      throw new GuanjiaError(`安装失败且回退不完整：${error.message}`, EXIT.ENVIRONMENT, { rollback_failures: rollbackFailures });
    }
    throw error;
  }
}

async function verifyManifest(project) {
  const path = join(project.guanjia, "manifest.json");
  if (!(await exists(path))) return { status: "fail", message: "缺少 manifest.json" };
  const manifest = await readJson(path, "guanjia/manifest.json");
  const missing = [];
  const changed = [];
  for (const [relativePath, expected] of Object.entries(manifest.files || {})) {
    const full = join(project.root, relativePath);
    if (!(await exists(full))) missing.push(relativePath);
    else if ((await sha256File(full)) !== expected) changed.push(relativePath);
  }
  if (missing.length || changed.length) return { status: "fail", message: "资源完整性不通过", missing, changed };
  return { status: "pass", message: "资源清单与文件一致" };
}

function safeNonce(value) {
  const nonce = String(value || "");
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(nonce)) {
    throw new GuanjiaError("nonce 只能包含字母、数字、点、下划线和短横线，长度 8–128。", EXIT.INPUT);
  }
  return nonce;
}

async function hookDetails(root) {
  const info = await gitInfo(root);
  if (!info.available) return { available: false, configured: null, hooks_dir: null, pre_commit: null };
  const configured = await git(root, ["config", "--get", "core.hooksPath"]).catch(() => null);
  const raw = configured || await git(root, ["rev-parse", "--git-path", "hooks"]);
  const hooksDir = resolve(root, raw);
  const preCommit = join(hooksDir, "pre-commit");
  return { available: true, configured: configured || null, hooks_dir: hooksDir, pre_commit: preCommit, exists: await exists(preCommit), managed: (await exists(preCommit)) && (await readText(preCommit)).includes("GUANJIA PRE-COMMIT WRAPPER") };
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function hookWrapper() {
  return `#!/bin/sh
# GUANJIA PRE-COMMIT WRAPPER
set -u
HOOK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ORIGINAL="$HOOK_DIR/pre-commit.guanjia-original"
if [ -f "$ORIGINAL" ]; then
  if [ -x "$ORIGINAL" ]; then
    "$ORIGINAL" "$@"
  else
    sh "$ORIGINAL" "$@"
  fi
  rc=$?
  [ "$rc" -eq 0 ] || exit "$rc"
fi
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 6
command -v node >/dev/null 2>&1 || { echo "[guanjia] 缺少 Node.js，无法执行提交检查。" >&2; exit 3; }
exec node "$PROJECT_ROOT/guanjia/bin/guanjia.mjs" check --scope staged --json
`;
}

async function installHooks(project) {
  const details = await hookDetails(project.root);
  if (!details.available) throw new GuanjiaError("当前目录不是 Git 仓库，不能安装提交检查。", EXIT.CAPABILITY);
  await fs.mkdir(details.hooks_dir, { recursive: true });
  if (details.managed) return { ok: true, status: "already_installed", ...details };
  const original = join(details.hooks_dir, "pre-commit.guanjia-original");
  let preserved = false;
  if (details.exists) {
    if (await exists(original)) throw new GuanjiaError("已存在管家保存的原 pre-commit，拒绝二次覆盖。", EXIT.CONFLICT);
    const stat = await fs.stat(details.pre_commit);
    await fs.copyFile(details.pre_commit, original);
    await fs.chmod(original, stat.mode & 0o777);
    preserved = true;
  }
  await writeAtomic(details.pre_commit, hookWrapper());
  await fs.chmod(details.pre_commit, 0o755);
  const config = structuredClone(project.config);
  config.updated_at = now();
  config.capabilities = { ...(config.capabilities || {}), submit_gate: "installed" };
  await writeJsonAtomic(project.configPath, config);
  return { ok: true, status: "installed", hooks_dir: details.hooks_dir, pre_commit: details.pre_commit, preserved_existing_hook: preserved, existing_hooks_path: details.configured };
}

async function uninstallHooks(project) {
  const details = await hookDetails(project.root);
  if (!details.available) return { ok: true, status: "not_installed", reason: "当前目录不是 Git 仓库" };
  if (!details.exists) return { ok: true, status: "not_installed", hooks_dir: details.hooks_dir, pre_commit: details.pre_commit };
  if (!details.managed) throw new GuanjiaError("当前 pre-commit 不是管家生成的 wrapper，拒绝覆盖或删除。", EXIT.CONFLICT);
  if (await readText(details.pre_commit) !== hookWrapper()) throw new GuanjiaError("管家 wrapper 已被用户修改，拒绝覆盖或删除，请人工合并。", EXIT.CONFLICT);

  const original = join(details.hooks_dir, "pre-commit.guanjia-original");
  if (await exists(original)) {
    const stat = await fs.stat(original);
    await fs.copyFile(original, details.pre_commit);
    await fs.chmod(details.pre_commit, stat.mode & 0o777);
    await fs.rm(original, { force: true });
  } else {
    await fs.rm(details.pre_commit, { force: true });
  }
  const config = structuredClone(project.config);
  config.updated_at = now();
  config.capabilities = { ...(config.capabilities || {}), submit_gate: "not_configured" };
  await writeJsonAtomic(project.configPath, config);
  return { ok: true, status: "uninstalled", hooks_dir: details.hooks_dir, pre_commit: details.pre_commit, restored_existing_hook: await exists(details.pre_commit) };
}

async function adapterManifest(project, host) {
  const path = join(project.guanjia, "adapters", host, "hooks.json");
  if (await exists(path)) return readJson(path, `guanjia/adapters/${host}/hooks.json`);
  return { host, version: "unknown", events: ["session_start", "user_prompt", "tool_after", "stop"], status: "unverified" };
}

async function probeHost(project, host, requestedNonce) {
  const nonce = safeNonce(requestedNonce || `probe-${Date.now()}-${randomUUID().slice(0, 8)}`);
  const manifest = await adapterManifest(project, host);
  const expected = { schema_version: 1, nonce, host, created_at: now(), expected_events: manifest.events || [], status: "pending", note: "只有收到同 nonce 的真实 host-event 回执后才算通过" };
  await writeJsonAtomic(join(project.guanjia, "runtime", "probes", `${nonce}.json`), expected);
  return { ok: true, status: "pending", nonce, host, expected_events: expected.expected_events, instructions: `在真实 ${host} 会话中触发事件后，用同一 nonce 调用 host-event；不要把配置文件存在当作探针通过。` };
}

async function hostEvent(project, input) {
  const nonce = safeNonce(input.nonce);
  const expectedPath = join(project.guanjia, "runtime", "probes", `${nonce}.json`);
  if (!(await exists(expectedPath))) throw new GuanjiaError(`没有找到 nonce=${nonce} 的待验证探针。`, EXIT.CONFLICT);
  const expected = await readJson(expectedPath, "探针预期");
  const host = input.host || expected.host;
  const event = required(input, "event");
  if (host !== expected.host) throw new GuanjiaError(`探针 host 不匹配：需要 ${expected.host}，收到 ${host}。`, EXIT.CONFLICT);
  if (Array.isArray(expected.expected_events) && expected.expected_events.length && !expected.expected_events.includes(event)) throw new GuanjiaError(`探针事件不在宿主契约中：${event}。`, EXIT.CONFLICT);
  const receipt = { schema_version: 1, nonce, host, event, session_id: input.session_id || null, received_at: now(), source: input.source || "host-adapter", status: "received" };
  await writeJsonAtomic(join(project.guanjia, "runtime", "probes", `${nonce}.receipt.json`), receipt);
  return { ok: true, status: "received", nonce, event: receipt.event, session_id: receipt.session_id };
}

async function hostProbeStatus(project) {
  const dir = join(project.guanjia, "runtime", "probes");
  if (!(await exists(dir))) return { status: "unverified", message: "尚未运行宿主探针" };
  const names = await fs.readdir(dir);
  const pending = [];
  const received = [];
  const invalid = [];
  for (const name of names.filter((item) => item.endsWith(".json") && !item.endsWith(".receipt.json"))) {
    const nonce = name.slice(0, -5);
    if (!(await exists(join(dir, `${nonce}.receipt.json`)))) {
      pending.push(nonce);
      continue;
    }
    try {
      const expected = await readJson(join(dir, name), "探针预期");
      const receipt = await readJson(join(dir, `${nonce}.receipt.json`), "探针回执");
      const valid = receipt.schema_version === 1 && receipt.status === "received" && receipt.nonce === nonce && receipt.host === expected.host && (!expected.expected_events?.length || expected.expected_events.includes(receipt.event));
      if (valid) received.push(nonce); else invalid.push(nonce);
    } catch {
      invalid.push(nonce);
    }
  }
  if (received.length) return { status: "pass", message: "已收到至少一条符合契约的真实探针回执", received, pending, invalid };
  if (invalid.length) return { status: "fail", message: "探针回执存在但不符合 nonce/host/event 契约", invalid, pending };
  return { status: "unverified", message: pending.length ? "探针已发出但尚未收到真实宿主回执" : "尚未运行宿主探针", pending };
}

async function doctor(project) {
  const checks = [];
  const add = (id, status, message, details = undefined) => checks.push({ id, status, message, ...(details ? { details } : {}) });
  const major = Number(process.versions.node.split(".")[0]);
  add("runtime", major >= 18 ? "pass" : "warn", `Node.js ${process.version}；建议使用 Node.js 22+。`);
  add("manifest", ...(Object.values(await verifyManifest(project))));
  add("state", project.state && project.state.schema_version === SCHEMA_VERSION ? "pass" : "fail", "状态格式可读取");
  const agents = await exists(join(project.root, "AGENTS.md")) ? await readText(join(project.root, "AGENTS.md")) : "";
  add("entry", agents.includes(MANAGED_BEGIN) && agents.includes(MANAGED_END) ? "pass" : "fail", "项目入口受管区块已存在");
  const info = await gitInfo(project.root);
  add("git", info.available ? "pass" : "warn", info.available ? "已发现 Git 仓库，可记录分支与现场。" : "未发现 Git 仓库；本地状态可用，版本备份不可用。");
  const hooks = await hookDetails(project.root);
  add("submit_gate", hooks.managed ? "pass" : hooks.configured ? "unknown" : "warn", hooks.managed ? "pre-commit 已安装管家检查，并保留原有检查链。" : hooks.configured ? `发现已有 hooksPath：${hooks.configured}；尚未证明它与管家检查组合。` : "提交检查尚未启用；不能把静态文件生成当成提交门禁生效。");
  const probe = await hostProbeStatus(project);
  add("host_hooks", probe.status, `${project.config.host || "generic"}：${probe.message}`, probe);
  if (await exists(join(project.root, ".aiops"))) add("legacy", "warn", "发现旧 .aiops/；本次保留原目录，未自动迁移。");
  return { ok: checks.every((item) => item.status !== "fail"), project: project.root, project_id: project.config.project_id, revision: project.state.revision, checks };
}

function renderDashboard(config, state, snapshot) {
  const task = state.task;
  const status = task ? task.status : "ready";
  const pause = state.authority.paused_by_user ? "用户已暂停：新会话只汇报，不自动执行" : "未暂停";
  const next = task?.next_action || "告诉管家想做什么，或先运行 status/resume 查看现状。";
  return `# 管家状态面板\n\n- 项目：${config.project_name}（${config.project_id}）\n- 状态版本：${state.revision}\n- 当前任务：${task ? `${task.id} / ${status} / ${task.goal}` : "无活跃任务"}\n- 授权与暂停：${pause}\n- 现场：${snapshot.branch || "无 Git 分支"} / ${snapshot.head || "无 HEAD"} / ${snapshot.dirty ? "有未提交改动" : "干净"}\n- 下一步：${next}\n- 最新检查点：${state.last_checkpoint?.at || "尚未生成"}\n\n> 本页由 state.json 派生；发生分歧时，以核验后的状态和 Git 现场为准。\n`;
}

function renderHandoff(config, state, snapshot) {
  const task = state.task;
  const complete = task?.summary_status === "complete";
  return `# 项目交接单\n\n生成时间：${now()}\n项目：${config.project_name} + ${config.project_id}\n状态版本：${state.revision}；规则版本：${config.package_version}\n现场：${snapshot.branch || "无 Git 分支"} / ${snapshot.head || "无 HEAD"} / ${snapshot.snapshot_digest || "无快照"} / ${snapshot.dirty ? "有未提交改动" : "干净"}\n完整性：${complete ? "完整" : "仅机械现场，摘要待补"}\n\n## 我在帮用户做什么\n${task ? `${task.goal}\n需求原话引用：${task.request_ref || "未登记"}\n关键约束：${(task.acceptance || []).join("；") || "未登记"}` : "当前没有活跃任务。"}\n\n## 当前进度\n- 已完成并验证：${task?.evidence_refs?.length ? task.evidence_refs.join("、") : "暂无有效证据"}\n- 已改但未验证：${task?.status === "implementing" ? "当前任务可能包含未验证改动，请先核对现场" : "无记录"}\n- 未开始：${task?.next_action || "无"}\n\n## 当前授权与暂停\n模式：${state.authority.mode}；范围：${state.authority.scope.join("、") || "未限定"}\n暂停：${state.authority.paused_by_user ? "是，用户明确暂停" : "否"}\n\n## 已确定的设计\n${task?.reuse?.length ? task.reuse.map((item) => `- ${item.path}：${item.decision}；${item.reason}`).join("\\n") : "暂无设计记录。"}\n\n## 卡点与失败尝试\n${task?.unknowns?.length ? task.unknowns.map((item) => `- ${item}`).join("\\n") : "无已登记卡点。"}\n\n## 下一步\n${task?.next_action || "先读取 guanjia/state.json 并核对项目现场。"}\n\n## 文件与验证入口\n- 状态：guanjia/state.json\n- 入口：guanjia/START.md\n- 证据：guanjia/records/evidence/\n\n给接手会话：先核对项目与 state revision，再核对 Git/工作区现场。本单是生成快照，发生分歧以核验后的 state 与现场为准。用户暂停未解除时只汇报，不自动执行。\n`;
}

async function renderDerived(project, state) {
  const snapshot = await workspaceSnapshot(project.root);
  await writeAtomic(join(project.guanjia, "README.md"), renderDashboard(project.config, state, snapshot));
  await writeAtomic(join(project.guanjia, "HANDOFF.md"), renderHandoff(project.config, state, snapshot));
}

function parseInput(options) {
  const raw = required(options, "input");
  if (String(raw).startsWith("@")) return readJson(resolve(String(raw).slice(1)), "任务输入");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new GuanjiaError(`--input 需要 JSON 或 @文件路径：${error.message}`, EXIT.INPUT);
  }
}

function nextId(prefix, state) {
  const number = state.revision + 1;
  return `${prefix}-${String(number).padStart(3, "0")}`;
}

function taskContractDigest(task) {
  return hashText(JSON.stringify({
    task_id: task.id,
    allowed_paths: task.allowed_paths || [],
    acceptance_revision: task.acceptance_revision,
    acceptance: task.acceptance || [],
    risk: task.risk,
    verification_mode: task.verification_mode,
  }));
}

function validateTaskInput(input) {
  if (!input || typeof input !== "object") throw new GuanjiaError("任务输入必须是 JSON 对象。", EXIT.INPUT);
  if (!String(input.goal || "").trim()) throw new GuanjiaError("任务缺少 goal。", EXIT.INPUT);
  if (!Array.isArray(input.allowed_paths) || input.allowed_paths.length === 0) throw new GuanjiaError("任务必须提供非空 allowed_paths。", EXIT.INPUT);
  if (!Array.isArray(input.acceptance) || input.acceptance.length === 0) throw new GuanjiaError("任务必须提供非空 acceptance。", EXIT.INPUT);
  if (input.risk !== undefined && !["low", "standard", "high"].includes(input.risk)) throw new GuanjiaError("任务 risk 必须是 low、standard 或 high。", EXIT.INPUT);
  if (input.verification_mode !== undefined && !["command", "lightweight"].includes(input.verification_mode)) throw new GuanjiaError("任务 verification_mode 必须是 command 或 lightweight。", EXIT.INPUT);
  if (input.verification_mode === "lightweight" && input.risk !== "low") throw new GuanjiaError("lightweight 验证只允许 low 风险任务。", EXIT.INPUT);
}

async function startTask(project, input, expectedRevision) {
  validateTaskInput(input);
  if (project.state.authority.paused_by_user) throw new GuanjiaError("当前任务处于用户暂停状态，先由用户明确恢复。", EXIT.CONFLICT);
  const snapshot = await workspaceSnapshot(project.root);
  const task = {
    id: input.id || nextId("T", project.state),
    status: "implementing",
    goal: String(input.goal),
    request_ref: input.request_ref || null,
    allowed_paths: input.allowed_paths,
    risk: input.risk || "standard",
    verification_mode: input.verification_mode || (input.risk === "low" ? "lightweight" : "command"),
    acceptance_revision: Number(input.acceptance_revision || 1),
    acceptance: input.acceptance,
    reuse: Array.isArray(input.reuse) ? input.reuse : [],
    next_action: input.next_action || "先核对范围并搜索已有实现。",
    unknowns: Array.isArray(input.unknowns) ? input.unknowns : [],
    evidence_refs: [],
    summary_status: "incomplete",
    started_at: now(),
  };
  const requestId = input.request_id || nextId("R", project.state);
  const requestPath = join(project.guanjia, "records", "requests", `${requestId}.json`);
  await writeJsonAtomic(requestPath, { schema_version: 1, request_id: requestId, captured_at: now(), input });
  const next = await mutateState(project, expectedRevision, (state) => {
    state.task = task;
    state.authority.scope = input.allowed_paths;
    state.authority.source_ref = `records/requests/${requestId}.json`;
    state.workspace = snapshot;
    state.session.active = true;
  });
  const updated = await loadProject(project.root);
  await renderDerived(updated, next);
  return { ok: true, task, revision: next.revision, request_ref: stateRef(next.authority.source_ref) };
}

function stateRef(value) {
  return value || null;
}

function allowedPath(path, patterns) {
  return patterns.some((pattern) => {
    if (pattern.endsWith("/**")) return path === pattern.slice(0, -3) || path.startsWith(pattern.slice(0, -2));
    if (pattern.includes("*")) {
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp(`^${escaped}$`).test(path);
    }
    return path === pattern;
  });
}

async function transitionTask(project, input) {
  const task = project.state.task;
  if (!task || task.id !== input.task_id) throw new GuanjiaError("当前状态没有匹配的活跃任务。", EXIT.CONFLICT);
  const target = input.status;
  const valid = ["ready", "implementing", "verifying", "completed", "paused"];
  if (!valid.includes(target)) throw new GuanjiaError(`不支持的任务状态：${target}`, EXIT.INPUT);
  const transitions = {
    ready: ["implementing"],
    implementing: ["verifying", "paused"],
    verifying: ["implementing", "completed", "paused"],
    paused: ["implementing"],
    completed: [],
  };
  if (!transitions[task.status].includes(target) && task.status !== target) throw new GuanjiaError(`不允许从 ${task.status} 转到 ${target}。`, EXIT.CONFLICT);
  const evidenceRefs = input.evidence_refs || task.evidence_refs || [];
  if (target === "completed") {
    if (!evidenceRefs.length) throw new GuanjiaError("没有有效验证证据，不能登记为 completed。", EXIT.CHECK);
    for (const ref of evidenceRefs) {
      const evidencePath = join(project.guanjia, "records", "evidence", `${ref}.json`);
      const evidence = await readJson(evidencePath, ref);
      if (evidence.status !== "PASS" || evidence.task_id !== task.id || evidence.acceptance_revision !== task.acceptance_revision || evidence.contract_digest !== taskContractDigest(task)) {
        throw new GuanjiaError(`证据 ${ref} 不是当前任务的有效 PASS。`, EXIT.CHECK);
      }
    }
  }
  const next = await mutateState(project, input.expected_revision, (state) => {
    state.task.status = target;
    state.task.evidence_refs = evidenceRefs;
    if (target === "paused") {
      state.authority.paused_by_user = input.pause_reason === "user" || input.paused_by_user === true;
      state.task.pause_reason = input.pause_reason || "environment";
    }
    if (target === "implementing" && state.authority.paused_by_user && input.resume_confirmed !== true) {
      throw new GuanjiaError("用户暂停未解除；需要明确 resume_confirmed=true。", EXIT.CONFLICT);
    }
    if (target === "implementing") state.authority.paused_by_user = false;
    state.workspace = input.workspace || state.workspace;
  });
  const updated = await loadProject(project.root);
  await renderDerived(updated, next);
  return { ok: true, task: next.task, revision: next.revision };
}

async function checkpoint(project, input = {}, releaseSession = false) {
  const snapshot = await workspaceSnapshot(project.root);
  const next = await mutateState(project, input.expected_revision, (state) => {
    if (state.task) {
      if (input.summary !== undefined) state.task.summary = String(input.summary);
      state.task.summary_status = String(input.summary || "").trim() ? "complete" : "incomplete";
      if (input.next_action !== undefined) state.task.next_action = String(input.next_action);
      if (Array.isArray(input.unknowns)) state.task.unknowns = input.unknowns;
      if (Array.isArray(input.evidence_refs)) state.task.evidence_refs = input.evidence_refs;
    }
    if (input.session_id !== undefined) state.session.host_session_id = input.session_id;
    state.session.active = !releaseSession;
    if (releaseSession) {
      state.session.host_session_id = null;
      state.session.lease_epoch += 1;
    }
    state.workspace = snapshot;
    state.last_checkpoint = { at: now(), kind: releaseSession ? "handoff" : "checkpoint", summary_status: state.task?.summary_status || "complete" };
  });
  const updated = await loadProject(project.root);
  await renderDerived(updated, next);
  return { ok: true, revision: next.revision, summary_status: next.task?.summary_status || "complete", handoff: releaseSession };
}

async function resume(project) {
  const current = await workspaceSnapshot(project.root);
  const state = project.state;
  const reasons = [];
  if (state.authority.paused_by_user) reasons.push("用户仍处于暂停状态");
  if (state.workspace.branch && current.branch && state.workspace.branch !== current.branch) reasons.push(`分支已变化：${state.workspace.branch} -> ${current.branch}`);
  if (state.workspace.head && current.head && state.workspace.head !== current.head) reasons.push("HEAD 已变化，需要重新核对现场");
  const action = state.authority.paused_by_user ? "report_only" : reasons.length ? "needs_review" : state.task ? "continue" : "ready";
  return { ok: action !== "needs_review", action, project_id: state.project_id, revision: state.revision, task: state.task, authority: state.authority, current_workspace: current, reasons, next_action: state.task?.next_action || "等待用户提出任务" };
}

async function runCommand(command, root) {
  if (!command || !command.executable || !Array.isArray(command.args)) throw new GuanjiaError("验证命令必须是 {executable,args,cwd,timeout_ms}，禁止传入 shell 字符串。", EXIT.INPUT);
  const cwd = command.cwd ? resolve(root, command.cwd) : root;
  const timeout = Number(command.timeout_ms || 300000);
  return new Promise((resolveResult) => {
    const child = spawn(command.executable, command.args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeout);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => { clearTimeout(timer); resolveResult({ exit_code: null, timed_out: timedOut, stdout, stderr: `${stderr}${error.message}` }); });
    child.on("close", (code, signal) => { clearTimeout(timer); resolveResult({ exit_code: code, signal, timed_out: timedOut, stdout, stderr }); });
  });
}

const LIGHTWEIGHT_DOCUMENT_SUFFIXES = new Set([".md", ".markdown", ".mdx", ".txt", ".rst", ".adoc", ".asciidoc"]);

function isLightweightDocument(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 && LIGHTWEIGHT_DOCUMENT_SUFFIXES.has(path.slice(dot).toLowerCase());
}

async function lightweightVerification(project, task) {
  const paths = await stagedPaths(project.root);
  const business = paths.filter((path) => !path.startsWith("guanjia/") && path !== "AGENTS.md");
  const outside = business.filter((path) => !allowedPath(path, task.allowed_paths || []));
  const nonDocument = business.filter((path) => !isLightweightDocument(path));
  const ok = task.risk === "low" && task.verification_mode === "lightweight" && business.length > 0 && outside.length === 0 && nonDocument.length === 0;
  const reason = task.risk !== "low"
    ? "只有 low 风险任务允许轻量验证"
    : task.verification_mode !== "lightweight"
      ? "当前任务契约未启用轻量验证"
      : !business.length
        ? "暂存区没有业务文档改动"
        : outside.length
          ? `改动超出任务范围：${outside.join(", ")}`
          : nonDocument.length
            ? `包含非文档文件：${nonDocument.join(", ")}`
            : "低风险文档改动已绑定当前任务范围";
  return { ok, paths: business, outside, non_document: nonDocument, reason };
}

async function verify(project, input) {
  const task = project.state.task;
  if (!task || task.id !== input.task_id) throw new GuanjiaError("验证任务不存在或 task_id 不匹配。", EXIT.CONFLICT);
  const before = await stagedDigest(project.root);
  const mode = input.mode || task.verification_mode || "command";
  if (mode !== "command" && mode !== "lightweight") throw new GuanjiaError("验证 mode 必须是 command 或 lightweight。", EXIT.INPUT);
  if (mode === "lightweight" && task.verification_mode !== "lightweight") throw new GuanjiaError("当前任务契约不允许轻量验证。", EXIT.CHECK);
  const lightweight = mode === "lightweight" ? await lightweightVerification(project, task) : null;
  const result = lightweight
    ? { exit_code: lightweight.ok ? 0 : 1, timed_out: false, stdout: "", stderr: lightweight.ok ? "" : lightweight.reason }
    : await runCommand(input.command, project.root);
  const after = await stagedDigest(project.root);
  const evidenceId = input.evidence_id || `E-${String(project.state.revision + 1).padStart(3, "0")}`;
  const evidence = {
    schema_version: 1,
    evidence_id: evidenceId,
    task_id: task.id,
    acceptance_revision: task.acceptance_revision,
    status: result.exit_code === null || result.timed_out ? "NOT_RUN" : result.exit_code === 0 && before === after ? "PASS" : "FAIL",
    command: mode === "lightweight" ? null : { executable: input.command.executable, args: input.command.args, cwd: input.command.cwd || ".", timeout_ms: Number(input.command.timeout_ms || 300000) },
    verification: mode === "lightweight" ? { kind: "lightweight", paths: lightweight.paths, reason: lightweight.reason } : { kind: "command" },
    exit_code: result.exit_code,
    timed_out: result.timed_out,
    stdout: result.stdout.slice(-20000),
    stderr: result.stderr.slice(-20000),
    snapshot_digest: before,
    contract_digest: taskContractDigest(task),
    created_at: now(),
    note: before === after ? "被测暂存快照在验证前后未变化" : "验证期间暂存快照变化，证据失效",
  };
  await writeJsonAtomic(join(project.guanjia, "records", "evidence", `${evidenceId}.json`), evidence);
  const next = await mutateState(project, input.expected_revision ?? project.state.revision, (state) => {
    state.task.evidence_refs = [...new Set([...(state.task.evidence_refs || []), evidenceId])];
    if (evidence.status === "PASS") state.task.status = "verifying";
    state.workspace = { ...state.workspace, snapshot_digest: before };
  });
  const updated = await loadProject(project.root);
  await renderDerived(updated, next);
  return { ok: evidence.status === "PASS", evidence, revision: next.revision };
}

async function checkStaged(project) {
  const paths = await stagedPaths(project.root);
  if (!paths.length) return { ok: true, result: "PASS", reason: "暂存区没有待检查改动" };
  const business = paths.filter((path) => !path.startsWith("guanjia/") && path !== "AGENTS.md");
  if (!business.length) return { ok: true, result: "PASS", reason: "本次只有管家资料或入口变更" };
  const task = project.state.task;
  if (!task) return { ok: false, result: "NOT_RUN", reason: "业务文件有改动，但没有当前任务契约" };
  const outside = business.filter((path) => !allowedPath(path, task.allowed_paths || []));
  if (outside.length) return { ok: false, result: "FAIL", reason: "改动超出当前任务范围", outside };
  const digest = await stagedDigest(project.root);
  const evidenceFiles = new Set(paths.filter((path) => path.startsWith("guanjia/records/evidence/")));
  const valid = [];
  for (const ref of task.evidence_refs || []) {
    const evidencePath = `guanjia/records/evidence/${ref}.json`;
    if (!evidenceFiles.has(evidencePath)) continue;
    const evidence = await readJson(join(project.guanjia, "records", "evidence", `${ref}.json`), ref);
    if (evidence.status === "PASS" && evidence.task_id === task.id && evidence.acceptance_revision === task.acceptance_revision && evidence.contract_digest === taskContractDigest(task) && evidence.snapshot_digest === digest) valid.push(ref);
  }
  if (!valid.length) return { ok: false, result: "NOT_RUN", reason: "没有绑定当前暂存快照的有效 PASS 证据；未执行、失败或过期证据不能放行。", snapshot_digest: digest };
  return { ok: true, result: "PASS", reason: "任务范围、验证证据和暂存快照已绑定", evidence_refs: valid, snapshot_digest: digest };
}

const LEGACY_AIops_PATHS = [
  ".aiops/AGENTS.md",
  ".aiops/读集.md",
  ".aiops/docs/PROGRESS.md",
  ".aiops/docs/所有者面板.md",
  ".aiops/docs/decisions",
  ".aiops/docs/audits",
  ".aiops/docs/archive",
  ".aiops/agents",
];

async function listFilesRecursive(path, prefix = "") {
  if (!(await exists(path))) return [];
  const stat = await fs.stat(path);
  if (stat.isFile()) return [{ path: prefix, size: stat.size }];
  const result = [];
  for (const name of await fs.readdir(path)) result.push(...await listFilesRecursive(join(path, name), prefix ? join(prefix, name) : name));
  return result;
}

async function legacyInventory(project) {
  const items = [];
  for (const relativePath of LEGACY_AIops_PATHS) {
    const full = join(project.root, relativePath);
    const files = await listFilesRecursive(full, relativePath);
    items.push(...files);
  }
  const progressPath = join(project.root, ".aiops/docs/PROGRESS.md");
  let authorityMode = null;
  let nextAction = null;
  let pausedByUser = false;
  if (await exists(progressPath)) {
    const progress = await readText(progressPath);
    authorityMode = progress.match(/当前授权模式：([^\r\n]+)/)?.[1]?.trim() || null;
    nextAction = progress.match(/续跑入口：([^\r\n]+)/)?.[1]?.trim() || null;
    pausedByUser = /用户明确暂停|paused_by_user\s*[:：]\s*true|当前暂停\s*[:：]\s*是/i.test(progress);
  }
  const policyMap = { "默认": "standard", "基础放权": "standard", "激进放权": "elevated" };
  const mappedPolicy = authorityMode ? policyMap[authorityMode] || null : "standard";
  const policyConflict = Boolean(authorityMode && !mappedPolicy);
  const conflicts = [];
  for (const item of items) {
    const destination = join(project.guanjia, "archive", "legacy-aiops", item.path.replace(/^\.aiops[\\/]/, ""));
    if (await exists(destination)) conflicts.push({ source: item.path, destination: relative(project.root, destination), reason: "目标已存在" });
  }
  return { source_present: items.length > 0, items, authority_mode: authorityMode, mapped_policy: mappedPolicy, policy_conflict: policyConflict, paused_by_user: pausedByUser, next_action: nextAction, conflicts };
}

async function migrateLegacy(project, apply) {
  const inventory = await legacyInventory(project);
  if (!inventory.source_present) return { ok: true, status: "not_needed", message: "未发现旧 .aiops/ 活跃资料。", inventory };
  const plan = {
    status: inventory.conflicts.length || inventory.policy_conflict ? "conflict" : apply ? "ready_to_apply" : "dry_run",
    source: ".aiops/",
    destination: "guanjia/archive/legacy-aiops/",
    preserve_source: true,
    inventory,
    actions: ["先复制到事务暂存区并校验来源文件", "复制旧资料为只读历史保留件", "生成迁移索引并映射可识别政策", "不自动删除 .aiops/，不把旧审计升级成新 PASS", "任何切换失败只回退本次受管变化"],
  };
  if (!apply || inventory.conflicts.length || inventory.policy_conflict) return { ok: inventory.conflicts.length === 0 && !inventory.policy_conflict, ...plan };
  const migrationId = `MIGRATION-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const staging = join(project.guanjia, "runtime", "migration-staging", migrationId);
  const copied = [];
  const createdDestinations = [];
  const migrationPath = join(project.guanjia, "records", "migrations", `${migrationId}.json`);
  const originalConfig = structuredClone(project.config);
  const originalState = structuredClone(project.state);
  let stateMutated = false;
  let configMutated = false;
  try {
    for (const item of inventory.items) {
      const source = join(project.root, item.path);
      const staged = join(staging, item.path.replace(/^\.aiops[\\/]/, ""));
      await fs.mkdir(dirname(staged), { recursive: true });
      await fs.copyFile(source, staged);
    }
    for (const item of inventory.items) {
      const staged = join(staging, item.path.replace(/^\.aiops[\\/]/, ""));
      const destination = join(project.guanjia, "archive", "legacy-aiops", item.path.replace(/^\.aiops[\\/]/, ""));
      await fs.mkdir(dirname(destination), { recursive: true });
      await fs.copyFile(staged, destination);
      createdDestinations.push(destination);
      copied.push({ source: item.path, destination: relative(project.root, destination) });
    }
    const migration = { schema_version: 1, migration_id: migrationId, created_at: now(), from: "aiops", source: ".aiops/", destination: "guanjia/archive/legacy-aiops/", copied, authority_mode: inventory.authority_mode, mapped_policy: inventory.mapped_policy, paused_by_user: inventory.paused_by_user, next_action: inventory.next_action, source_preserved: true, note: "旧资料只作为历史保留件；动态事实以 guanjia/state.json 为准。" };
    await writeJsonAtomic(migrationPath, migration);
    const release = await acquireLock(project.guanjia);
    let next;
    try {
      const current = await readJson(project.statePath, "guanjia/state.json");
      if (current.revision !== originalState.revision) throw new GuanjiaError(`迁移前状态已变化：需要 ${originalState.revision}，实际为 ${current.revision}。`, EXIT.CONFLICT);
      next = structuredClone(current);
      next.schema_version = SCHEMA_VERSION;
      next.revision = current.revision + 1;
      next.updated_at = now();
      next.legacy_migration = { migration_id: migrationId, source: ".aiops/", copied_at: now(), source_preserved: true, legacy_authority_mode: inventory.authority_mode, mapped_policy: inventory.mapped_policy, legacy_next_action: inventory.next_action };
      if (inventory.mapped_policy) next.authority.mode = inventory.mapped_policy;
      if (inventory.paused_by_user) next.authority.paused_by_user = true;
      next.authority.source_ref = `records/migrations/${migrationId}.json`;
      await writeJsonAtomic(`${project.statePath}.bak`, current);
      await writeJsonAtomic(project.statePath, next);
      stateMutated = true;
    } finally {
      await release().catch(() => {});
    }
    const config = structuredClone(originalConfig);
    config.updated_at = now();
    config.legacy_migration = { migration_id: migrationId, source_preserved: true, mapped_policy: inventory.mapped_policy };
    await writeJsonAtomic(project.configPath, config);
    configMutated = true;
    await fs.rm(staging, { recursive: true, force: true });
    const updated = await loadProject(project.root);
    await renderDerived(updated, next);
    return { ok: true, status: "applied", migration_id: migrationId, copied, revision: next.revision, source_preserved: true, mapped_policy: inventory.mapped_policy, paused_by_user: inventory.paused_by_user };
  } catch (error) {
    for (const destination of createdDestinations.reverse()) await fs.rm(destination, { force: true }).catch(() => {});
    await fs.rm(migrationPath, { force: true }).catch(() => {});
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    if (stateMutated) await writeJsonAtomic(project.statePath, originalState).catch(() => {});
    if (configMutated) await writeJsonAtomic(project.configPath, originalConfig).catch(() => {});
    throw error;
  }
}

async function uninstallPlan(project) {
  const manifestPath = join(project.guanjia, "manifest.json");
  const managedFiles = await exists(manifestPath) ? Object.keys((await readJson(manifestPath, "guanjia/manifest.json")).files || {}) : [];
  const agents = await exists(join(project.root, "AGENTS.md")) ? await readText(join(project.root, "AGENTS.md")) : "";
  return { ok: true, status: "dry_run_only", managed_files: managedFiles, has_managed_agents_block: agents.includes(MANAGED_BEGIN) && agents.includes(MANAGED_END), hook: await hookDetails(project.root), warning: "初版卸载只生成清单，不删除状态、证据、交接历史或用户修改。" };
}

async function main(argv) {
  const command = argv[0];
  const { positional, options } = parseArgs(argv.slice(1));
  if (!command) throw new GuanjiaError("用法：guanjia <init|doctor|status|context|task|checkpoint|resume|handoff|verify|check|hooks install|hooks uninstall|probe|host-event|migrate|uninstall>", EXIT.INPUT);
  if (command === "init") {
    const project = required(options, "project");
    const result = await install(project, options.name || positional[0], options.host || "generic", Boolean(options["dry-run"]));
    if (options.json) console.log(json(result)); else console.log(result.dry_run ? `预览完成：${result.plan.project}` : `管家已接入：${result.plan.project}`);
    return result;
  }
  const project = await loadProject(options.project || process.cwd());
  if (command === "doctor") {
    const result = await doctor(project);
    console.log(json(result));
    if (!result.ok) process.exitCode = EXIT.CAPABILITY;
    return result;
  }
  if (command === "status") {
    const result = { ok: true, project: project.root, project_id: project.config.project_id, revision: project.state.revision, task: project.state.task, authority: project.state.authority, workspace: await workspaceSnapshot(project.root), next_action: project.state.task?.next_action || "等待用户提出任务" };
    console.log(json(result));
    return result;
  }
  if (command === "context") {
    const recordedEvent = options["record-event"] ? await recordContextEvent(project, { event: options.event || "manual", session_id: options.session || null, host: options.host || project.config.host, source: options.source || "context" }) : null;
    const current = recordedEvent ? await loadProject(project.root) : project;
    const result = { ok: true, event: options.event || "manual", session_id: options.session || null, ...(recordedEvent ? { recorded_event: recordedEvent } : {}), project_id: current.config.project_id, revision: current.state.revision, task: current.state.task ? { id: current.state.task.id, status: current.state.task.status, goal: current.state.task.goal, allowed_paths: current.state.task.allowed_paths, risk: current.state.task.risk || "standard", verification_mode: current.state.task.verification_mode || "command", acceptance: current.state.task.acceptance, next_action: current.state.task.next_action, evidence_refs: current.state.task.evidence_refs } : null, authority: current.state.authority, workspace: await workspaceSnapshot(current.root), instructions: current.state.authority.paused_by_user ? "用户已暂停：只汇报，不执行写任务。" : "先核对现场，再按当前任务范围工作。" };
    console.log(json(result));
    return result;
  }
  if (command === "resume") { const result = await resume(project); console.log(json(result)); return result; }
  if (command === "checkpoint") { const result = await checkpoint(project, options.input ? parseInput(options) : {}); console.log(json(result)); return result; }
  if (command === "handoff") { const result = await checkpoint(project, options.input ? parseInput(options) : {}, true); console.log(json(result)); return result; }
  if (command === "hooks" && positional[0] === "install") { const result = await installHooks(project); console.log(json(result)); return result; }
  if (command === "hooks" && positional[0] === "uninstall") { const result = await uninstallHooks(project); console.log(json(result)); return result; }
  if (command === "probe") { const result = await probeHost(project, options.host || project.config.host || "generic", options.nonce); console.log(json(result)); return result; }
  if (command === "host-event") { const result = await hostEvent(project, parseInput(options)); console.log(json(result)); return result; }
  if (command === "migrate" && options.from === "aiops") { const result = await migrateLegacy(project, Boolean(options.apply)); console.log(json(result)); if (!result.ok) process.exitCode = result.status === "conflict" ? EXIT.CONFLICT : EXIT.CAPABILITY; return result; }
  if (command === "uninstall") { const result = await uninstallPlan(project); console.log(json(result)); return result; }
  if (command === "task" && positional[0] === "start") { const input = parseInput(options); const result = await startTask(project, input, input.expected_revision); console.log(json(result)); return result; }
  if (command === "task" && positional[0] === "transition") { const input = parseInput(options); const result = await transitionTask(project, input); console.log(json(result)); return result; }
  if (command === "verify") { const result = await verify(project, parseInput(options)); console.log(json(result)); if (!result.ok) process.exitCode = EXIT.CHECK; return result; }
  if (command === "check") { const result = await checkStaged(project); console.log(json(result)); if (!result.ok) process.exitCode = EXIT.CHECK; return result; }
  throw new GuanjiaError(`未知命令：${command}`, EXIT.INPUT);
}

main(process.argv.slice(2)).catch((error) => {
  const exitCode = Number.isInteger(error.code) ? error.code : EXIT.ENVIRONMENT;
  const payload = { ok: false, error: error.message, code: exitCode, ...(error.details ? { details: error.details } : {}) };
  if (process.argv.includes("--json")) console.log(json(payload));
  else console.error(`[guanjia] ${error.message}`);
  process.exitCode = exitCode;
});
