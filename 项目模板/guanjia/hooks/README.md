# 提交检查接入

运行 `node guanjia/bin/guanjia.mjs hooks install` 安装一个组合式 `pre-commit`：

1. 保留已有的 `pre-commit`，备份为 `pre-commit.guanjia-original`；
2. 先执行原检查，原检查失败就停止；
3. 原检查通过后执行管家的暂存范围、任务范围和验证证据检查；
4. 不修改已有 `core.hooksPath` 配置。

如果已有 hooks 管理器会自动重写文件，doctor 只显示“未知/未验证”，不能把一次安装当作长期生效。管家 hook 不运行模型、不自动 add、不自动修改证据，也不递归提交。
