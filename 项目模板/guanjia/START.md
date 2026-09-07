# 管家入口

这是项目内可移植的短入口。新会话先核对现场，再读取状态，不需要重新粘贴长提示词。

## 常用动作

- 查看现状：node guanjia/bin/guanjia.mjs status --json
- 恢复任务：node guanjia/bin/guanjia.mjs resume --json
- 暂停/交接：node guanjia/bin/guanjia.mjs handoff
- 继续工作：先读取本文件、guanjia/state.json 和生成的 guanjia/HANDOFF.md。

## 边界

管家能可靠保存结构化状态、现场和验证证据；不能保证模型永远记住全部聊天，也不能通过提示词隔离拥有文件写权限的进程。用户暂停不会因换窗口自动解除。
