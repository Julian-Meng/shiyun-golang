// 诗云维护页 Worker — 绑定 route「shiyun.cohenjikan.com/」(只拦页面导航,/data 与 /assets 直连
// 边缘缓存,不进 Worker → 省调用额度)。源站正常时透明放行;源站 5xx / 不可达(整机宕机)时返回内联
// 维护页(HTML 嵌在本脚本里,不依赖源站,所以源站全挂也能显示)。?__maint_preview=1 可强制预览。
addEventListener("fetch", (event) => event.respondWith(handle(event.request)));

async function handle(request) {
  const url = new URL(request.url);
  // preview triggers: ?__maint_preview=1 (query) OR header X-Maint-Preview (header doesn't affect route
  // path matching, so it lets ops verify which paths actually reach this Worker).
  if (url.searchParams.has("__maint_preview") || request.headers.get("x-maint-preview")) return maintenance();
  try {
    const resp = await fetch(request);
    if (resp.status >= 500 && resp.status <= 599) return maintenance();
    return resp;
  } catch (_e) {
    return maintenance();
  }
}

function maintenance() {
  return new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "120",
      "cache-control": "no-store",
    },
  });
}

const MAINTENANCE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>诗云 · 维护中 / Poetry Cloud · Under Maintenance</title>
<meta http-equiv="refresh" content="30" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    background: radial-gradient(ellipse 120% 80% at 50% 28%, #0c1426 0%, #060a14 55%, #020306 100%);
    color: #e9e1cb;
    font-family: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", STSong, ui-serif, Georgia, serif;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    overflow: hidden; position: relative; -webkit-font-smoothing: antialiased;
  }
  .stars { position: absolute; inset: 0; pointer-events: none; }
  .stars i {
    position: absolute; inset: -50%; background-repeat: repeat;
    animation: drift 200s linear infinite, twinkle 6s ease-in-out infinite alternate;
  }
  .stars i:nth-child(1){ background-image:
      radial-gradient(1.5px 1.5px at 20% 30%, #fff8 40%, transparent),
      radial-gradient(1px 1px at 70% 60%, #cfe3ff7a 40%, transparent),
      radial-gradient(1.5px 1.5px at 45% 80%, #ffe9b86b 40%, transparent),
      radial-gradient(1px 1px at 85% 15%, #fff6 40%, transparent);
      background-size: 340px 340px; }
  .stars i:nth-child(2){ background-image:
      radial-gradient(1px 1px at 30% 50%, #9fc0ff66 40%, transparent),
      radial-gradient(1.5px 1.5px at 60% 20%, #fff5 40%, transparent),
      radial-gradient(1px 1px at 90% 70%, #ffd98a55 40%, transparent);
      background-size: 520px 520px; animation-duration: 320s, 9s; opacity:.7; }
  @keyframes drift { to { transform: translate(-12%, -8%); } }
  @keyframes twinkle { from { opacity:.5; } to { opacity:1; } }
  .card { position: relative; z-index: 1; text-align: center; padding: 3rem 1.8rem; max-width: 540px; }
  .brand { font-size: clamp(2.4rem, 8vw, 3.4rem); letter-spacing: .34em; font-weight: 600;
    color: #ecca7c; text-indent: .34em; text-shadow: 0 0 24px #e9b85033, 0 0 60px #e9b85018;
    animation: glow 5s ease-in-out infinite alternate; }
  @keyframes glow { from { text-shadow: 0 0 18px #e9b85022, 0 0 44px #e9b85010; }
                    to   { text-shadow: 0 0 30px #e9b85044, 0 0 78px #e9b85022; } }
  .latin { margin-top: .5rem; font-size: .82rem; letter-spacing: .42em; text-indent:.42em;
    color: #8a93a6; text-transform: uppercase; }
  .status { margin-top: 2.4rem; font-size: clamp(1.15rem, 4.5vw, 1.5rem); font-weight: 600; color: #f1ead6; }
  .msg { margin-top: 1.1rem; line-height: 2; font-size: clamp(.92rem, 3.4vw, 1.02rem); color: #b9b8a8; }
  .dots { display:inline-block; width:1.4em; text-align:left; }
  .dots::after { content:""; animation: dots 1.6s steps(4,end) infinite; }
  @keyframes dots { 0%{content:"";} 25%{content:"·";} 50%{content:"··";} 75%{content:"···";} 100%{content:"";} }
  .rule { width: 64px; height: 1px; margin: 2.2rem auto 0;
    background: linear-gradient(90deg, transparent, #e9b85055, transparent); }
  .mail { margin-top: 1.6rem; font-size: .9rem; color: #8a93a6; }
  .mail a { color: #ecca7c; text-decoration: none; border-bottom: 1px solid #ecca7c40; padding-bottom: 1px; }
  .mail a:hover { border-bottom-color: #ecca7c; }
</style>
</head>
<body>
  <div class="stars" aria-hidden="true"><i></i><i></i></div>
  <main class="card">
    <div class="brand">诗云</div>
    <div class="latin">Poetry Cloud</div>
    <h1 class="status">星图正在维护中<span class="dots"></span></h1>
    <p class="msg">
      一切可能的诗，仍静静悬在虚空里等待。<br />
      我们正在校准星图，请稍候片刻——<br />
      页面将自动恢复，无需刷新。
    </p>
    <div class="rule" aria-hidden="true"></div>
    <p class="mail">紧急事宜请联系 · <a href="mailto:q63725959@gmail.com">q63725959@gmail.com</a></p>
  </main>
</body>
</html>`;
