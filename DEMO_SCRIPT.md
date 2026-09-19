# KillSwitch — 90 秒演示分镜（Agentic Commerce）

**目标评委印象（一句话）**  
Agent 可以替你向白名单商家代付，但不能拿主私钥；超额或陌生商家会被合约拒绝并留证；你随时 Freeze / Close 退款。

**开录前**
```bash
./demos/demo-up.sh
# 打开 http://127.0.0.1:8787/ 并 Cmd+Shift+R
```
建议窗口：浏览器全屏控制台；分辨率 ≥ 1280×800；勿开 VPN。

**口播节奏**：短句；Deny 出现时停半秒强调「拒绝也是成功」。

---

## 时间轴（≈90s）

| 秒 | 画面 | 操作 | 口播（中文可直接念） |
|----|------|------|---------------------|
| 0–8 | 顶栏 + 情景区 | 滚到「Agentic Commerce」 | 「KillSwitch：智能体商业里的花费开关。Agent 代付，合约当 Guard。」 |
| 8–18 | Policy Grant | Budget `0.5`，商家保持默认白名单 → **Grant session** | 「先授权 Session Key：半个 ETH、一小时、只许付给白名单店——不是把私钥交给模型。」 |
| 18–28 | 商家目录 | 点 **Coffee Lane**，展示报价 JSON | 「发现商家、确认报价。这是目录里的白名单咖啡店，不是任意地址。」 |
| 28–45 | Checkout | 点 **Checkout 代付**；看双栏 + 绿色 Credential | 「Agent checkout。模型只提议，合约放行。这里是 CommercePaymentCredential——商家可凭交易哈希对账。」 |
| 45–60 | Shadow Shop | 点 **付给 Shadow Shop**；红色 denied 凭证 | 「再试未授权商家。PaymentDenied——拒绝也是成功，说明边界在链上，不在 prompt。」 |
| 60–75 | Bridge Lab（可选切 1 个页签） | 点 **AI Security** 或 **Verifiable AI** | 「Bridge：安全成绩单 / 模型提议 vs 合约裁决，评委能核验。」 |
| 75–90 | Freeze 或 Close | **Freeze (Kill)** 或 **Close / 退款** | 「用户主权：Freeze 停权，或 Close 退回剩余预算。Agent 无法覆盖。」 |

**备用一句（超时）**  
「完整路径在 JUDGE.md；规则演进见 AA_SESSION_KEY.md，不必今天上主网。」

---

## 英文 20s elevator（答辩用）

> KillSwitch lets an agent pay whitelisted merchants under a time-bounded budget. The agent proposes; the contract guards. Denial is a recorded success. The user can freeze or close-and-refund anytime. Session rules are stable today and map to ERC-4337 session keys tomorrow.

---

## 录制检查清单

- [ ] Grant 后 sessionId 变化、Policy 非空  
- [ ] Coffee checkout → credential `status: paid` + tx  
- [ ] Shadow → `status: denied` / Merchant not allowed  
- [ ] Freeze 后 `frozen: true` **或** Close 后显示 refundedEth  
- [ ] 画面无 `.env` / API key  

## 一键无口播备选

若来不及手点：硬刷新后点 **开始 60 秒演示（自动）**，再补 15 秒手动 Checkout 故事（自动演示不含目录漏斗）。
