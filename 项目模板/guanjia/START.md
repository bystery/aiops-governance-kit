# 管家入口

这是项目内可移植的短入口。新会话先核对现场，再读取状态，不需要重新粘贴长提示词。

## 常用动作

- 查看现状：node guanjia/bin/guanjia.mjs status --json
- 恢复任务：node guanjia/bin/guanjia.mjs resume --json
- 暂停/交接：node guanjia/bin/guanjia.mjs handoff
- 继续工作：先读取本文件、guanjia/state.json 和生成的 guanjia/HANDOFF.md。
- 修改目标或验收标准：通过 `task revise` 修订任务契约；修订后旧验证证据会自动失效，必须重新验证。
- 提交检查：node guanjia/bin/guanjia.mjs hooks install
- 回退提交检查：node guanjia/bin/guanjia.mjs hooks uninstall
- 宿主探针：node guanjia/bin/guanjia.mjs probe --host <zcode|codex> --nonce <唯一值>
- ZCode/Codex 适配：读取 guanjia/adapters/README.md，按宿主要求启用/信任后再做真实探针

## Windows 与任意工作目录

如果 PowerShell 当前目录不是项目根目录，`node guanjia/bin/guanjia.mjs` 会按当前目录解析而找不到文件。优先使用项目内入口：

```powershell
& .\guanjia\guanjia.ps1 status --json
& .\guanjia\guanjia.ps1 migrate --from aiops --dry-run --json
& .\guanjia\guanjia.ps1 hooks install
```

也可以从任意目录调用绝对路径：

```powershell
& "<项目绝对路径>\guanjia\guanjia.ps1" probe --host zcode --nonce zcode-demo-001
```

如果坚持直接运行 Node，请先切换到项目根目录：

```powershell
Set-Location "<项目绝对路径>"
node .\guanjia\bin\guanjia.mjs migrate --from aiops --dry-run --json
```

## 边界

管家能可靠保存结构化状态、现场和验证证据；不能保证模型永远记住全部聊天，也不能通过提示词隔离拥有文件写权限的进程。用户暂停不会因换窗口自动解除。
