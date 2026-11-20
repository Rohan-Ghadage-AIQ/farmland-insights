/**
 * The report's stylesheet. A4 pages that print one per sheet and read as stacked cards on screen.
 * Fonts are named, never downloaded, so the file stays self-contained: Manrope and Noto Sans are
 * used where installed, otherwise the system's own sans-serif.
 */
export const REPORT_STYLE = `
:root{--ink:#0e2a30;--ink-2:#14373e;--teal:#0a6475;--cyan:#8fd6e2;--amber:#e9b54a;--text:#2c4348;--muted:#536a6f;--line:#e3ecec;--soft:#f4f7f7;--soft-2:#eef4f4;--canvas:#e8efef;--good:#1f9d55;--good-bg:#e7f5ec;--medium:#c98a12;--medium-bg:#fdf3dd;--bad:#c8402f;--bad-bg:#fbe9e6;--none:#6b7f83;--none-bg:#edf1f1;--head:Manrope,"Segoe UI",system-ui,-apple-system,Roboto,sans-serif;--body:"Noto Sans","Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--canvas);color:var(--text);font:13px/1.6 var(--body)}
.page{position:relative;width:100%;max-width:210mm;min-height:297mm;margin:24px auto;padding:13mm 14mm 16mm;background:#fff;border-radius:10px;box-shadow:0 2px 14px rgba(14,42,48,.08)}
h1,h2,h3,.head{font-family:var(--head);color:var(--ink)}
a{color:var(--teal)}
.muted{color:var(--muted)}small{display:block;color:var(--muted);font-size:11px;font-weight:400}
.eyebrow{margin:0 0 4px;font:800 10px/1.3 var(--head);letter-spacing:.08em;text-transform:uppercase;color:var(--teal)}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.brand b{font:800 15px/1.1 var(--head);color:var(--ink)}.brand small{font-size:10px}
.mark{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:8px;background:var(--soft-2);color:var(--teal)}
.mark svg{width:18px;height:18px}
.page-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.page-head .mark{width:26px;height:26px}.page-head .mark svg{width:15px;height:15px}
.progress{flex:1;height:2px;background:var(--line);border-radius:2px;overflow:hidden}.progress i{display:block;height:100%;background:var(--amber)}
.pno{min-width:34px;padding:3px 10px;border-radius:999px;background:var(--ink);color:#fff;font:800 11px/1.4 var(--head);text-align:center}
.band{position:relative;overflow:hidden;margin:0 0 16px;padding:14px 20px 14px 24px;border-radius:12px;background:linear-gradient(90deg,var(--ink) 0%,var(--ink-2) 100%);color:#fff;font:800 17px/1.3 var(--head)}
.band:before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:5px;border-radius:0 4px 4px 0;background:var(--amber)}
.band .arcs{position:absolute;right:-30px;top:-50%;height:200%;width:auto;opacity:.5}
.idx{display:flex;align-items:center;gap:10px;margin:20px 0 6px;padding-bottom:8px;border-bottom:1px solid var(--line);font:800 15px/1.3 var(--head)}
.idx:before{content:"";width:9px;height:9px;border-radius:2px;background:var(--teal);flex:none}
.lead{margin:0 0 12px}
.row2{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;margin-bottom:12px}
.card{border:1px solid var(--line);border-radius:12px;padding:14px;background:#fff;break-inside:avoid}
.card.soft{background:var(--soft)}
.map-card{display:flex;flex-direction:column;gap:8px}
.field-map{display:block;width:100%;height:auto;background:var(--soft-2);border-radius:10px}
.pass{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:var(--muted)}.pass b{color:var(--ink);font-weight:600}
.scale-name{margin:0;font:800 30px/1.05 var(--head);color:var(--ink)}
.scale-tag{margin:10px 0 12px;font:700 12px/1.3 var(--head);color:var(--ink)}
.scale{position:relative;margin:0 0 4px}
.brackets{position:relative;height:9px;margin-bottom:3px}
.brackets span{position:absolute;top:0;height:7px;border:1.5px solid;border-bottom:0;border-radius:2px 2px 0 0}
.brackets .good{border-color:var(--good)}.brackets .medium{border-color:var(--amber)}.brackets .bad{border-color:var(--bad)}
.ramp{display:flex;height:14px;border-radius:7px;overflow:hidden}.ramp i{flex:1}
.ticks{display:flex;justify-content:space-between;margin-top:3px;font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums}
.bands{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px}
.bands div{padding:7px 9px;border-radius:8px;font-size:11px;font-weight:600}
.bands b{display:block;margin-top:2px;font:800 14px/1.2 var(--head);color:var(--ink)}
.bands .good{background:var(--good-bg);color:var(--good)}.bands .medium{background:var(--medium-bg);color:var(--medium)}.bands .bad{background:var(--bad-bg);color:var(--bad)}
.dot{display:inline-grid;place-items:center;width:14px;height:14px;margin-right:4px;border-radius:50%;color:#fff;font-size:9px;font-weight:800;vertical-align:-2px}
.good .dot{background:var(--good)}.medium .dot{background:var(--amber)}.bad .dot{background:var(--bad)}
.avg{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:12px;padding-top:10px;border-top:1px dashed var(--line);font-size:12px}
.avg b{font:800 18px/1 var(--head);color:var(--ink)}
.chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.chip.good{background:var(--good-bg);color:var(--good)}.chip.fair,.chip.medium{background:var(--medium-bg);color:var(--medium)}.chip.attention,.chip.bad{background:var(--bad-bg);color:var(--bad)}.chip.none{background:var(--none-bg);color:var(--none)}
.split{display:flex;height:10px;margin:8px 0 10px;border-radius:5px;overflow:hidden;background:var(--line)}
.split .good{background:var(--good)}.split .medium{background:var(--amber)}.split .bad{background:var(--bad)}
.shares{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:11px}
.shares b{display:block;font:800 18px/1.2 var(--head);color:var(--ink)}
.shares .good span{color:var(--good)}.shares .medium span{color:var(--medium)}.shares .bad span{color:var(--bad)}
.hist{display:flex;align-items:flex-end;gap:3px;height:76px;margin-top:12px;padding:0 2px;border-bottom:1px solid var(--line)}
.hist div{position:relative;flex:1;border-radius:3px 3px 0 0}
.hist em{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);font-size:9px;font-style:normal;color:var(--muted);white-space:nowrap}
.todo ul{margin:0;padding-left:18px}.todo li{margin:4px 0}
.background{position:relative;margin:4px 0 0;padding:12px 16px 12px 20px;border-radius:12px;background:var(--soft)}
.background:before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:4px;border-radius:0 3px 3px 0;background:var(--amber)}
.background p:last-child{margin:0}
.empty{padding:22px;border:1px dashed var(--line);border-radius:12px;background:var(--soft);text-align:center;color:var(--muted)}
.empty b{display:block;margin-bottom:4px;font:800 14px/1.3 var(--head);color:var(--ink)}
.value-card{display:flex;flex-direction:column;justify-content:center;gap:4px}
.value-card .big{font:800 34px/1.1 var(--head);color:var(--ink)}
.hero{position:relative;overflow:hidden;display:grid;grid-template-columns:1.35fr 1fr;gap:12px;padding:26px 24px;border-radius:16px;background:radial-gradient(120% 140% at 100% 0%,#1d4a52 0%,var(--ink) 55%);color:#c9e4e8}
.hero h1{margin:0 0 10px;color:#fff;font-size:30px;line-height:1.1}
.hero p{margin:0 0 18px;font-size:12px}
.hero .arcs{position:absolute;right:-40px;top:-60px;width:330px;height:330px;opacity:.55;pointer-events:none}
.hero-art{position:relative;display:grid;place-items:center}
.hero-art .field-map{background:transparent;max-width:220px;filter:drop-shadow(0 6px 14px rgba(0,0,0,.35))}
.pills{display:flex;flex-wrap:wrap;gap:8px}
.pill{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:10px;background:rgba(255,255,255,.07);border:1px solid rgba(143,214,226,.18)}
.pill .mark{width:26px;height:26px;background:rgba(143,214,226,.15);color:var(--cyan)}
.pill small{color:#9cc3c9;font-size:10px}.pill b{display:block;color:#fff;font:800 13px/1.2 var(--head)}
.section-label{margin:22px 0 8px;font:800 11px/1.3 var(--head);letter-spacing:.12em;text-transform:uppercase;color:var(--ink)}
.details{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.details .card{padding:12px 14px;background:var(--soft)}
.details .mark{width:24px;height:24px;margin-bottom:8px;background:#fff}
.details dt{font-size:11px;color:var(--muted)}.details dd{margin:0;font-weight:600;color:var(--ink)}
table{border-collapse:collapse;width:100%;font-size:12px}
th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
thead th{background:var(--ink);color:#fff;font:800 10px/1.3 var(--head);letter-spacing:.06em;text-transform:uppercase}
thead th:first-child{border-radius:8px 0 0 0}thead th:last-child{border-radius:0 8px 0 0}
.toc td:first-child,.toc th:first-child{width:56px;text-align:center}.toc td:last-child,.toc th:last-child{width:70px;text-align:center}
.toc tr.main td{font-weight:600;color:var(--ink)}.toc tr.main td:first-child,.toc tr.main td:last-child{font-family:var(--head);font-weight:800}
.toc tr.sub td{padding-top:3px;padding-bottom:3px;border-bottom:0;color:var(--muted);font-size:11px}.toc tr.sub td:nth-child(2){padding-left:26px}
.toc tr.sub + tr.main td{border-top:1px solid var(--line)}
.toc a{color:inherit;text-decoration:none}.toc a:hover{color:var(--teal);text-decoration:underline}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.strong{font-weight:700;color:var(--ink)}.wrap{min-width:220px}
tr.group th{background:var(--soft-2);color:var(--ink);font:800 11px/1.3 var(--head);letter-spacing:.04em}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.tile{display:flex;flex-direction:column;gap:2px;padding:14px;border-radius:12px;border:1px solid var(--line);background:var(--soft)}
.tile .big{font:800 22px/1.2 var(--head);color:var(--ink)}
.tile.good{background:var(--good-bg);border-color:#cde9d7}.tile.good .big{color:var(--good)}
.tile.fair{background:var(--medium-bg);border-color:#f3dfb0}.tile.fair .big{color:var(--medium)}
.tile.attention{background:var(--bad-bg);border-color:#f2cbc4}.tile.attention .big{color:var(--bad)}
.score-row{display:grid;grid-template-columns:minmax(150px,1.6fr) 2fr minmax(140px,1.2fr);gap:6px 14px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
.score-row strong{color:var(--ink);font-family:var(--head)}
.score-bar{height:10px;border-radius:5px;background:var(--line);overflow:hidden}.fill{display:block;height:100%;border-radius:5px}
.fill.good{background:var(--good)}.fill.fair{background:var(--amber)}.fill.attention{background:var(--bad)}.fill.none{background:var(--none)}
.score-value{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}.score-value strong{font-size:16px}
.photo{display:block;width:100%;height:auto;border-radius:10px;border:1px solid var(--line)}
.legend{margin-top:8px;font-size:11px}.legend-bar{display:flex;align-items:center;gap:8px;margin-top:3px}.legend-bar i{flex:1;height:10px;border-radius:5px}
.guide{margin:0;padding-left:18px}.guide li{margin:3px 0}
.actions h3{margin:16px 0 6px;font-size:13px}.actions ul{margin:0;padding-left:18px}.actions li{margin:4px 0}
details{margin:8px 0;border:1px solid var(--line);border-radius:10px;overflow:hidden}
summary{cursor:pointer;padding:9px 14px;font:800 12px/1.4 var(--head);color:var(--ink);background:var(--soft)}
.scroll{overflow:auto;max-height:65vh}.xscroll{overflow-x:auto}.cells th{position:sticky;top:0}.cells th,.cells td{white-space:nowrap}.cells td.wrap{white-space:normal}
td.score.good{background:var(--good-bg);color:var(--good);font-weight:700}td.score.fair{background:var(--medium-bg);color:var(--medium);font-weight:700}td.score.attention{background:var(--bad-bg);color:var(--bad);font-weight:700}td.score.none{color:var(--none)}
.closing{margin-top:22px;padding:22px;border-radius:14px;background:var(--ink);color:#fff;text-align:center;font:800 16px/1.3 var(--head);letter-spacing:.14em;text-transform:uppercase}
.notes{margin:14px 0 0;padding-left:18px;font-size:11px;color:var(--muted)}
footer{margin-top:14px;font-size:11px;color:var(--muted);text-align:center}
@media (max-width:760px){.page{margin:0 0 12px;padding:16px;min-height:0;border-radius:0}.row2,.hero,.tiles,.details{grid-template-columns:1fr}.score-row{grid-template-columns:1fr}.hero-art{display:none}}
@page{size:A4;margin:0}
@media print{body{background:#fff}.xscroll{overflow:visible}.page{margin:0;border-radius:0;box-shadow:none;break-after:page}.page:last-child{break-after:auto}.scroll{max-height:none;overflow:visible}.cells th{position:static}.idx,.band{break-after:avoid}tr,.tile,.score-row{break-inside:avoid}}
`;
