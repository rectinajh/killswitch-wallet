/** Booth UI: LLM→Deny labels + Forced skip + auto-demo guided spotlight tour. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function decorateBoothHtml(html) {
  let s = typeof html === 'string' ? html : html.toString('utf8');
  s = s.replace(
    '<button class="danger" id="btnBudget">Over-budget</button>\n        <button class="danger" id="btnMerchant">Off-allowlist</button>',
    '<button class="danger" id="btnBudget" title="Real LLM propose, then contract denies over-budget">LLM→Deny Over-budget</button>\n' +
      '        <button class="danger" id="btnMerchant" title="Real LLM propose, then contract denies off-allowlist">LLM→Deny Off-allowlist</button>\n' +
      '        <span style="margin:0 0.4rem;opacity:0.5">|</span>\n' +
      '        <button class="ghost" id="btnBudgetForced" title="Skip LLM — forced adversarial amount (fast)">Forced skip: Over-budget</button>\n' +
      '        <button class="ghost" id="btnMerchantForced" title="Skip LLM — forced adversarial merchant (fast)">Forced skip: Off-allowlist</button>'
  );
  s = s.replace(
    /<div class="fee-note">\s*Over-budget：[\s\S]*?Off-allowlist：[\s\S]*?<\/div>/,
    '<div class="fee-note">\n' +
      '        <strong>Primary (LLM→Deny):</strong> real LLM propose (often 25–65s with Kimi) + on-chain <code>PaymentDenied</code> — dual evidence for judges.\n' +
      '        <br/><strong>Forced skip:</strong> no LLM — instant adversarial submit for warm-up / failover.\n' +
      '        Over-budget: tiny session where amount+2% exceeds budget. Off-allowlist: unpaid merchant.\n' +
      '      </div>'
  );

  if (!s.includes('id="demoTourBanner"') && !s.includes('/* demo-tour */')) {
    let tourCss = '';
    let banner = '';
    let tourJs = '';
    try {
      tourCss = fs.readFileSync(path.join(__dirname, 'demo-tour.css.txt'), 'utf8');
      banner = fs.readFileSync(path.join(__dirname, 'demo-tour-banner.html.txt'), 'utf8');
      tourJs = fs.readFileSync(path.join(__dirname, 'demo-tour-snippet.js.txt'), 'utf8');
    } catch (e) {
      // fall through without tour if assets missing
    }
    if (tourCss && s.includes('</style>')) s = s.replace('</style>', tourCss + '</style>', 1);
    if (banner) s = s.replace('<div class="toast-host" id="toasts"></div>', '<div class="toast-host" id="toasts"></div>' + banner, 1);
    const attrHooks = [
      ['id="bridgeLab"', 'id="bridgeLab" data-demo-target="bridgeLab"'],
      ['id="statusStrip"', 'id="statusStrip" data-demo-target="statusStrip"'],
      ['id="panelPolicy"', 'id="panelPolicy" data-demo-target="panelPolicy"'],
      ['id="panelAgent"', 'id="panelAgent" data-demo-target="panelAgent"'],
      ['id="dualEvidence"', 'id="dualEvidence" data-demo-target="dualEvidence"'],
      ['id="panelChain"', 'id="panelChain" data-demo-target="panelChain"'],
      ['id="receipts"', 'id="receipts" data-demo-target="receipts"'],
      ['id="ctxCards"', 'id="ctxCards" data-demo-target="ctxCards"'],
      ['id="btnFreeze"', 'id="btnFreeze" data-demo-target="btnFreeze"'],
      ['id="demoGuide"', 'id="demoGuide" data-demo-target="demoGuide"'],
    ];
    for (const [from, to] of attrHooks) {
      const i = s.indexOf(from);
      if (i >= 0 && !s.slice(i, i + from.length + 48).includes('data-demo-target')) s = s.replace(from, to);
    }
    s = s.replace(
      'title="自动执行：Grant → Propose → Over-budget Deny → Freeze">开始 60 秒演示（自动）</button>',
      'title="Auto: Grant → Propose → LLM→Deny Over-budget → Freeze">Start 60s demo (auto)</button>',
    );
    if (tourJs) s = s.replace('</body>', tourJs + '</body>', 1);
  }

  if (!s.includes('/* booth-boundary-ui */')) {
    const boot = [
      '<script>/* booth-boundary-ui */',
      '(function () {',
      '  function bind() {',
      '    if (typeof api !== "function" || typeof $ !== "function") return;',
      '    window.boundary = async function boundary(caseName, opts) {',
      '      opts = opts || {};',
      '      var skipLlm = !!opts.skipLlm;',
      '      try {',
      '        var modeLabel = skipLlm ? "Forced skip" : "LLM→Deny";',
      '        if (typeof toast === "function") toast(modeLabel, skipLlm ? "Submitting without LLM…" : "Calling LLM (often 25–65s)…", true);',
      '        var data = await api("/api/demo/boundary", {',
      '          method: "POST",',
      '          body: JSON.stringify({ case: caseName, skipLlm: skipLlm }),',
      '        });',
      '        if (typeof setSid === "function") setSid(data.sessionId);',
      '        var resultEl = $("result");',
      '        if (resultEl) resultEl.textContent = JSON.stringify(data, null, 2);',
      '        if (typeof renderDualEvidence === "function") renderDualEvidence(data);',
      '        var denied = data.result && data.result.events && data.result.events.find(function (e) { return e.type === "denied"; });',
      '        var reason = (denied && denied.reason) || "denied";',
      '        var mode = data.mode || (skipLlm ? "forced-skip-llm" : "llm-propose-then-guard");',
      '        if (typeof toast === "function") toast(modeLabel, reason + " · " + mode + " · deny = success", true);',
      '        if (typeof setMeaning === "function") setMeaning("Guard denied — dual evidence: LLM proposal + on-chain PaymentDenied.", true);',
      '        if (typeof markDone === "function") markDone(3);',
      '        if (typeof setGuideStep === "function") setGuideStep(4);',
      '        if (typeof refreshSessions === "function") await refreshSessions();',
      '        if (typeof refreshPolicy === "function") await refreshPolicy();',
      '        if (typeof loadEvents === "function") await loadEvents(true);',
      '      } catch (e) {',
      '        var r = $("result");',
      '        if (r) r.textContent = e.message || String(e);',
      '      }',
      '    };',
      '    var b = $("btnBudget"); if (b) b.onclick = function () { return window.boundary("budget", { skipLlm: false }); };',
      '    var m = $("btnMerchant"); if (m) m.onclick = function () { return window.boundary("merchant", { skipLlm: false }); };',
      '    var bf = $("btnBudgetForced"); if (bf) bf.onclick = function () { return window.boundary("budget", { skipLlm: true }); };',
      '    var mf = $("btnMerchantForced"); if (mf) mf.onclick = function () { return window.boundary("merchant", { skipLlm: true }); };',
      '  }',
      '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);',
      '  else setTimeout(bind, 0);',
      '})();',
      '</script>',
      '',
    ].join('\n');
    s = s.replace('</body>', boot + '</body>');
  }
  return s;
}
