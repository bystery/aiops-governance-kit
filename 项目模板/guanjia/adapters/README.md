# 宿主适配契约

适配器只负责把宿主事件翻译成管家核心调用，不复制状态机、任务规则或验证逻辑。

适配器能力分为三种：`supported`（已在真实宿主触发并有 nonce 回执）、`unverified`（配置或模拟存在，但未真实触发）、`unsupported`（该宿主明确没有此事件）。配置文件存在不等于已加载。

真实探针流程：

```sh
node guanjia/bin/guanjia.mjs probe --host zcode --nonce zcode-demo-001
node guanjia/bin/guanjia.mjs host-event --input '{"nonce":"zcode-demo-001","event":"session_start","session_id":"真实宿主提供的 id","host":"zcode"}'
node guanjia/bin/guanjia.mjs doctor --json
```

探针只记录回执，不自动执行用户任务；未收到同 nonce 的真实事件前，doctor 必须显示 `unverified`。
