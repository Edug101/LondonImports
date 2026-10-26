/* London Imports — loja
   Usa o mesmo Supabase de sempre: conexão em js/config.js (db) e
   funções de segurança e Pix em js/util.js. Este arquivo só LÊ dados. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mobile = () => matchMedia("(max-width: 860px)").matches;

  const SECTIONS = ["Relógios", "Perfumes", "Tênis"]; // as mesmas do painel

  let all = [];
  let cfg = { whatsapp: "", instagram: "", pix_key: "", pix_name: "", pix_city: "" };
  let promos = []; // "compre 2 ganhe 1" ativos (escolhidos no painel)
  let coupon = null; // cupom de % que o cliente digitou
  let tab = "Todos";
  let query = "";

  // ---------- utilidades ----------
  const stockOf = (x) => Number(x.stock ?? 1);
  const out = (x) => stockOf(x) <= 0;
  const pics = (x) => (x.images && x.images.length ? x.images : x.image_url ? [x.image_url] : []).map(safeUrl).filter(Boolean);
  const hasOff = (x) => x.old_price && Number(x.old_price) > Number(x.price);
  const pct = (x) => Math.round(100 - (x.price / x.old_price) * 100);
  const wa = (text, n) => `https://wa.me/${digits(n || cfg.whatsapp)}?text=${encodeURIComponent(text)}`;
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const byId = (id) => all.find((x) => String(x.id) === String(id));
  const lowText = (n) => (n === 1 ? "Última unidade" : `Só restam ${n}`);

  // ---------- cupons e promoções ----------
  const r2 = (v) => Math.round(v * 100) / 100;
  const promoOf = (x) => promos.find((c) => (c.product_ids || []).includes(x.id));
  const pctFor = (x) => (coupon && (coupon.product_ids || []).includes(x.id) ? coupon.percent : 0);
  // a cada 3 unidades da promoção, a mais barata sai de graça; o cupom de % vale nas outras
  function calc(ls) {
    const units = [];
    ls.forEach((b) => { for (let i = 0; i < b.qty; i++) units.push({ p: b.p, price: Number(b.p.price) }); });
    const used = {}, add = (k, v) => (used[k] = r2((used[k] || 0) + v));
    promos.forEach((pr) => {
      const el = units.filter((u) => !u.free && (pr.product_ids || []).includes(u.p.id)).sort((a, b) => b.price - a.price);
      el.slice(el.length - Math.floor(el.length / 3)).forEach((u) => { u.free = true; add(pr.code, u.price); });
    });
    if (coupon) units.forEach((u) => { const p = pctFor(u.p); if (!u.free && p) add(coupon.code, r2(u.price * p / 100)); });
    const sub = r2(units.reduce((s, u) => s + u.price, 0));
    const off = r2(Object.values(used).reduce((s, v) => s + v, 0));
    return { sub, used, total: r2(sub - off) };
  }
  const discName = (code) => (promos.some((p) => p.code === code) ? "Compre 2 ganhe 1" : `Cupom ${code} (-${coupon ? coupon.percent : 0}%)`);
  const discText = (r) => Object.entries(r.used).map(([k, v]) => `${discName(k)}: -${money(v)}`).join("\n");
  // relatório do painel: guarda quanto cada cupom economizou (uma vez por pedido)
  const logged = new Set();
  function logUse(r, channel) {
    Object.entries(r.used).forEach(([code, v]) => {
      const k = `${code}|${v}|${r.total}`;
      if (v <= 0 || logged.has(k)) return;
      logged.add(k);
      db.rpc("log_coupon_use", { p_code: code, p_discount: v, p_total: r.total, p_channel: channel }).then(() => {}, () => {});
    });
  }
  async function applyCoupon(input, msg) {
    const v = input.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!v) { input.focus(); return; }
    msg.className = "cupom-msg"; msg.textContent = "Conferindo...";
    const { data, error } = await db.rpc("check_coupon", { p_code: v });
    const c = !error && data && data[0];
    if (!c) { msg.classList.add("bad"); msg.textContent = "Cupom inválido ou expirado."; return; }
    if (c.kind === "b2g1") { msg.textContent = "Essa promoção entra sozinha: leve 3 unidades dos produtos da promoção e pague 2."; return; }
    coupon = c;
    try { sessionStorage.setItem("li-cupom", JSON.stringify(c)); } catch (err) { /* navegação privada */ }
    refreshCoupon();
  }
  function couponMsg(k, x) {
    const msg = $(`#${k}-cup-msg`);
    if (!coupon) { msg.className = "cupom-msg"; msg.textContent = ""; return; }
    $(`#${k}-cup`).value = coupon.code;
    const ok = x ? pctFor(x) : lines().some((b) => pctFor(b.p));
    msg.className = "cupom-msg" + (ok ? " ok" : " bad");
    msg.innerHTML = ok
      ? `Cupom <b>${esc(coupon.code)}</b> aplicado: ${coupon.percent}% de desconto. <button type="button" data-uncup>Remover</button>`
      : `O cupom <b>${esc(coupon.code)}</b> não vale para ${x ? "este produto" : "os produtos da sacola"}. <button type="button" data-uncup>Remover</button>`;
  }
  function refreshCoupon() {
    if (cur && sheet.classList.contains("open")) { couponMsg("p", cur); showPrice(); }
    drawBag();
  }
  try { coupon = JSON.parse(sessionStorage.getItem("li-cupom")) || null; } catch (err) { coupon = null; }

  // ---------- dados ----------
  async function load() {
    const [p, s, c] = await Promise.all([
      db.from("products")
        .select("id,name,brand,category,description,price,old_price,sizes,image_url,images,whatsapp,pix_key,featured,popular,stock")
        .eq("active", true)
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false }),
      db.from("settings").select("whatsapp,instagram,pix_key,pix_name,pix_city").eq("id", 1).single(),
      db.from("coupons").select("code,kind,product_ids").eq("kind", "b2g1").eq("active", true),
    ]);
    if (p.error) throw p.error;
    all = p.data || [];
    if (s.data) cfg = s.data;
    promos = c.data || [];
  }

  // ---------- card ----------
  function card(x, i = 0) {
    const g = pics(x), so = out(x), st = stockOf(x);
    let badge = "";
    if (so) badge = `<span class="badge sold">Esgotado</span>`;
    else if (promoOf(x)) badge = `<span class="badge promo">Compre 2 ganhe 1</span>`;
    else if (hasOff(x)) badge = `<span class="badge off">-${pct(x)}%</span>`;
    else if (x.popular) badge = `<span class="badge">Mais pedido</span>`;
    return `<article class="card enter${so ? " sold" : ""}" style="--i:${i}">
      <span class="c-img">
        ${g[0] ? `<img src="${g[0]}" alt="" loading="lazy" decoding="async">` : ""}
        ${g[1] && !so ? `<img class="alt" src="${g[1]}" alt="" loading="lazy" decoding="async">` : ""}
        ${badge}
      </span>
      <button class="c-open" data-open="${esc(x.id)}" aria-label="Ver ${esc(x.name)}"></button>
      ${so ? "" : `<button class="c-add" data-add="${esc(x.id)}" aria-label="Adicionar ${esc(x.name)} à sacola"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`}
      <div class="c-body">
        <span class="c-brand">${esc(x.brand || x.category || "")}</span>
        <h3 class="c-name">${esc(x.name)}</h3>
        <div class="c-price"><span class="price">${money(x.price)}</span>${hasOff(x) ? `<span class="old">${money(x.old_price)}</span>` : ""}</div>
        ${!so && st <= 5 ? `<span class="c-note">${lowText(st)}</span>` : ""}
      </div>
    </article>`;
  }

  // ---------- destaque ----------
  function renderFeatured() {
    const f = all.find((x) => x.featured && pics(x)[0] && !out(x)) || all.find((x) => pics(x)[0] && !out(x));
    const btn = $("#feat");
    if (!f) { btn.hidden = true; return; }
    btn.disabled = false;
    btn.dataset.open = f.id;
    btn.setAttribute("aria-label", `Ver ${f.name}`);
    $("#feat-img").innerHTML = `<img src="${pics(f)[0]}" alt="">`;
    $("#feat-info").innerHTML = `<span class="feat-tag">${f.featured ? "Destaque" : "Novidade"}</span><span class="feat-name">${esc(f.name)}</span><span class="feat-price">${money(f.price)}</span>`;
    const img = $("#feat-img img");
    const show = () => requestAnimationFrame(() => img.classList.add("in"));
    if (img.complete) show(); else img.addEventListener("load", show, { once: true });
  }

  // ---------- abas ----------
  function renderTabs() {
    // ordem pedida pela loja: Mais pedidos, Relógios, Catálogo, Perfumes
    const n = (s) => all.filter((x) => x.category === s).length;
    const items = [];
    const np = all.filter((x) => x.popular).length;
    if (np) items.push(["pop", "Mais pedidos", np]);
    items.push(["Relógios", "Relógios", n("Relógios")], ["Todos", "Catálogo", all.length], ["Perfumes", "Perfumes", n("Perfumes")]);
    // Tênis só aparece se algum tênis for cadastrado no painel
    if (n("Tênis")) items.push(["Tênis", "Tênis", n("Tênis")]);
    $("#tabs").innerHTML = items.map(([v, l, n]) =>
      `<button class="tab" data-tab="${esc(v)}" aria-pressed="${v === tab}">${esc(l)}<small>${n}</small></button>`
    ).join("") + `<span class="tab-ind" id="tab-ind" aria-hidden="true"></span>`;
    moveInd();
  }
  function moveInd() {
    const on = $(`.tab[aria-pressed="true"]`), ind = $("#tab-ind");
    if (!on || !ind) return;
    ind.style.width = on.offsetWidth + "px";
    ind.style.transform = `translateX(${on.offsetLeft}px)`;
    // no celular, só rola as abas se a escolhida estiver fora da tela
    const tabs = $("#tabs");
    const l = on.offsetLeft, r = l + on.offsetWidth;
    if (l < tabs.scrollLeft || r > tabs.scrollLeft + tabs.clientWidth) tabs.scrollTo({ left: l - (tabs.clientWidth - on.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  }

  // ---------- grade ----------
  function list() {
    let l = all;
    if (tab === "pop") l = l.filter((x) => x.popular);
    else if (tab !== "Todos") l = l.filter((x) => x.category === tab);
    if (query) { const q = norm(query); l = l.filter((x) => norm(`${x.name} ${x.brand || ""} ${x.category || ""}`).includes(q)); }
    return l;
  }
  function renderGrid() {
    const l = list();
    const title = query ? `Resultados para “${query}”` : tab === "Todos" ? "Catálogo" : tab === "pop" ? "Mais pedidos" : tab;
    $("#shop-t").textContent = title;
    $("#cnt").textContent = `${l.length} ${l.length === 1 ? "produto" : "produtos"}`;
    if (l.length) { $("#grid").innerHTML = l.map(card).join(""); return; }
    $("#grid").innerHTML = query
      ? `<p class="empty">Nada encontrado para “${esc(query)}”. Tente outro nome ou <button data-clear>veja todos os produtos</button>.</p>`
      : `<p class="empty">Ainda não há produtos nesta seção. <button data-clear>Ver todos os produtos</button></p>`;
  }
  function setTab(v) {
    tab = v;
    $$(".tab").forEach((t) => t.setAttribute("aria-pressed", t.dataset.tab === v));
    moveInd();
    renderGrid();
    const hd = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--hd-h")) || 68;
    const top = $("#produtos").getBoundingClientRect().top + scrollY - hd + 1;
    if (scrollY > top) scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  }

  // ---------- mais pedidos ----------
  function renderBest() {
    const l = all.filter((x) => x.popular && !out(x));
    // só aparece quando acrescenta algo: pelo menos 2 e não todos os produtos da loja
    $("#best").hidden = l.length < 2 || l.length >= all.length;
    $("#best-rail").innerHTML = l.map(card).join("");
  }
  $("#best-prev").addEventListener("click", () => $("#best-rail").scrollBy({ left: -280, behavior: "smooth" }));
  $("#best-next").addEventListener("click", () => $("#best-rail").scrollBy({ left: 280, behavior: "smooth" }));

  function renderAll() {
    renderFeatured(); renderTabs(); renderGrid(); renderBest();
    const hello = wa("Olá! Vim pelo site da London Imports.");
    ["#hero-wa", "#ft-wa", "#mb-wa"].forEach((s) => ($(s).href = hello));
    const ig = handle(cfg.instagram);
    if (ig) { $("#ft-ig").href = `https://instagram.com/${ig}`; $("#ft-ig").textContent = `Instagram @${ig}`; $("#ft-ig-li").hidden = false; }
  }

  // ---------- janelas: fundo fica inerte e o Tab não escapa ----------
  const layers = () => $$("body > header, body > main, body > footer, body > nav, body > .bar, body > .msearch, body > .skip");
  function modalOn(on) { layers().forEach((el) => (el.inert = on)); }
  function trapTab(e, box) {
    if (e.key !== "Tab") return;
    const f = $$('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])', box).filter((el) => el.offsetParent !== null && !el.closest("[hidden]"));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---------- produto ----------
  const sheet = $("#sheet"), panel = $("#sheet-p");
  let cur = null, size = "", lastFocus = null;

  const sheetCalc = () => calc([{ p: cur, qty: 1 }]);
  function buyLink() {
    const r = sheetCalc(), off = Object.keys(r.used).length;
    $("#p-wa").href = wa(`Olá! Tenho interesse em: ${cur.name}${size ? ` (tamanho ${size})` : ""} - ${money(r.sub)}${off ? `\n${discText(r)}\nTotal: ${money(r.total)}` : ""}`, cur.whatsapp);
  }
  function showPrice() {
    const r = sheetCalc(), p = pctFor(cur);
    $("#p-price").innerHTML = p
      ? `<span class="price">${money(r.total)}</span><span class="old">${money(cur.price)}</span><span class="cup-tag">Cupom -${p}%</span>`
      : `<span class="price">${money(cur.price)}</span>${hasOff(cur) ? `<span class="old">${money(cur.old_price)}</span>` : ""}`;
    buyLink();
    $("#p-pix").hidden = true;
  }
  const needSize = () => (cur.sizes || []).length > 0 && !size;
  function askSize() {
    const s = $("#p-sizes"); s.classList.remove("shake"); void s.offsetWidth; s.classList.add("shake");
    toast("Selecione um tamanho");
    s.querySelector("button")?.focus({ preventScroll: false });
  }

  function openP(x) {
    if (!x) return;
    cur = x; size = ""; lastFocus = document.activeElement;
    const g = pics(x);
    $("#p-track").innerHTML = g.map((u, i) => `<img src="${u}" alt="${i ? "" : esc(x.name)}"${i ? ' loading="lazy"' : ""}>`).join("");
    $("#p-track").scrollLeft = 0;
    $("#p-prev").hidden = $("#p-next").hidden = g.length < 2;
    $("#p-dots").innerHTML = g.length > 1 ? g.map((_, i) => `<button class="${i ? "" : "on"}" data-dot="${i}" aria-label="Foto ${i + 1} de ${g.length}"></button>`).join("") : "";
    $("#p-brand").textContent = x.brand || x.category || "";
    $("#p-name").textContent = x.name;
    $("#p-promo").hidden = !promoOf(x) || out(x);
    const st = stockOf(x), so = out(x);
    $("#p-stock").hidden = so || st > 5;
    $("#p-stock").textContent = lowText(st);
    const sizes = x.sizes || [];
    $("#p-sizes-wrap").hidden = !sizes.length || so;
    $("#p-sizes").innerHTML = sizes.map((s) => `<button role="radio" aria-checked="false" data-size="${esc(s)}">${esc(s)}</button>`).join("");
    const pk = pixKey(x.pix_key) || pixKey(cfg.pix_key);
    $("#p-act").hidden = so;
    $("#p-sold").hidden = !so;
    $("#p-sold-wa").href = wa(`Olá! Quando volta o produto: ${x.name}?`, x.whatsapp);
    $("#p-pixb").hidden = !pk || so;
    $("#p-pix").hidden = true;
    $("#p-desc").textContent = x.description || "";
    $("#p-cup").value = coupon ? coupon.code : "";
    couponMsg("p", x);
    showPrice();
    panel.scrollTop = 0; panel.style.transform = "";
    sheet.classList.add("open");
    document.body.classList.add("lock");
    modalOn(true);
    setTimeout(() => $(".sheet-x").focus({ preventScroll: true }), 50);
    startAuto(g.length);
  }
  function closeP() {
    stopAuto();
    sheet.classList.remove("open");
    if (!bagEl.classList.contains("open")) { document.body.classList.remove("lock"); modalOn(false); }
    panel.style.transform = "";
    lastFocus?.focus?.({ preventScroll: true });
  }
  $$("[data-close]", sheet).forEach((el) => el.addEventListener("click", closeP));

  // galeria: bolinhas acompanham o deslizar
  let dotRaf = 0;
  $("#p-track").addEventListener("scroll", () => {
    if (dotRaf) return;
    dotRaf = requestAnimationFrame(() => {
      dotRaf = 0;
      const t = $("#p-track"), i = Math.round(t.scrollLeft / t.clientWidth);
      $$("#p-dots button").forEach((d, k) => d.classList.toggle("on", k === i));
    });
  }, { passive: true });
  const goPic = (i) => {
    const t = $("#p-track"), n = t.children.length;
    t.scrollTo({ left: t.clientWidth * ((i + n) % n), behavior: reduce ? "auto" : "smooth" });
  };
  const picNow = () => { const t = $("#p-track"); return Math.round(t.scrollLeft / t.clientWidth); };
  $("#p-dots").addEventListener("click", (e) => {
    const d = e.target.closest("[data-dot]"); if (!d) return;
    stopAuto(); goPic(+d.dataset.dot);
  });
  $("#p-prev").addEventListener("click", () => { stopAuto(); goPic(picNow() - 1); });
  $("#p-next").addEventListener("click", () => { stopAuto(); goPic(picNow() + 1); });

  // fotos passam sozinhas a cada 3s; para de vez quando a pessoa mexe na galeria
  const AUTO_MS = 3000;
  let autoT = 0;
  function startAuto(n) {
    stopAuto();
    if (n < 2 || reduce) return;
    autoT = setInterval(() => { if (!document.hidden) goPic(picNow() + 1); }, AUTO_MS);
  }
  function stopAuto() { clearInterval(autoT); autoT = 0; }
  ["pointerdown", "wheel", "keydown"].forEach((ev) => $(".p-gal").addEventListener(ev, stopAuto, { passive: true }));

  $("#p-sizes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-size]"); if (!b) return;
    size = b.dataset.size;
    $$("#p-sizes button").forEach((x) => x.setAttribute("aria-checked", x === b));
    buyLink();
  });
  $("#p-wa").addEventListener("click", (e) => { if (needSize()) { e.preventDefault(); askSize(); return; } logUse(sheetCalc(), "whatsapp"); });
  ["p", "bag"].forEach((k) => $(`#${k}-cup-f`).addEventListener("submit", (e) => { e.preventDefault(); applyCoupon($(`#${k}-cup`), $(`#${k}-cup-msg`)); }));
  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-uncup]")) return;
    coupon = null; $("#p-cup").value = ""; $("#bag-cup").value = "";
    try { sessionStorage.removeItem("li-cupom"); } catch (err) { /* navegação privada */ }
    if (cur) couponMsg("p", cur);
    refreshCoupon();
  });
  $("#p-add").addEventListener("click", () => {
    if (needSize()) return askSize();
    const img = $("#p-track img");
    if (addToBag(cur, size)) { flyToBag(img); closeP(); }
  });
  $("#p-pixb").addEventListener("click", () => {
    if (needSize()) return askSize();
    const box = $("#p-pix");
    if (!box.hidden) { box.hidden = true; return; }
    const r = sheetCalc();
    logUse(r, "pix");
    renderPix(box, pixKey(cur.pix_key) || pixKey(cfg.pix_key), r.total, `${cur.name}${size ? ` (tamanho ${size})` : ""}${Object.keys(r.used).length ? ` com ${discText(r).replace(/\n/g, ", ")}` : ""}`, cur.whatsapp);
    box.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  });

  // arrastar a gaveta para baixo fecha (celular)
  (() => {
    const grab = $("#grab"); let y0 = null, dy = 0;
    grab.addEventListener("pointerdown", (e) => { if (!mobile()) return; y0 = e.clientY; dy = 0; panel.classList.add("dragging"); grab.setPointerCapture(e.pointerId); });
    grab.addEventListener("pointermove", (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; });
    const end = () => { if (y0 === null) return; panel.classList.remove("dragging"); y0 = null; if (dy > 110) closeP(); else panel.style.transform = ""; };
    grab.addEventListener("pointerup", end);
    grab.addEventListener("pointercancel", end);
  })();

  // ---------- Pix ----------
  function renderPix(box, pk, amount, what, sellerWa) {
    const pay = pixPayload(pk, cfg.pix_name, cfg.pix_city, amount);
    let qr = "";
    try { const q = qrcode(0, "M"); q.addData(pay); q.make(); qr = `<img src="${q.createDataURL(6, 2)}" alt="QR Code do Pix no valor de ${money(amount)}">`; }
    catch (err) { qr = `<p>Não foi possível gerar o QR Code. Use a chave abaixo.</p>`; }
    const proof = wa(`Olá! Paguei no Pix: ${what} - ${money(amount)}. Segue o comprovante.`, sellerWa);
    box.innerHTML = `${qr}<p>Valor: <b>${money(amount)}</b></p><code>${esc(pk)}</code>
      <div class="row"><button data-copy="pay">Copiar Pix copia e cola</button><button data-copy="key">Copiar chave</button></div>
      <p>Depois de pagar, <a href="${proof}" target="_blank" rel="noopener">envie o comprovante no WhatsApp</a>.</p>`;
    box.onclick = async (e) => {
      const b = e.target.closest("[data-copy]"); if (!b) return;
      try { await navigator.clipboard.writeText(b.dataset.copy === "key" ? pk : pay); b.textContent = "Copiado"; toast("Copiado"); }
      catch (err) { toast("Não foi possível copiar"); }
    };
    box.hidden = false;
  }

  // ---------- sacola ----------
  const KEY = "li-bag-v2";
  let bag = [];
  try { bag = JSON.parse(localStorage.getItem(KEY)) || []; } catch (err) { bag = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(bag)); } catch (err) { /* navegação privada */ } };
  const inBagOf = (id) => bag.filter((b) => b.id === id).reduce((s, b) => s + b.qty, 0);
  const limitMsg = (max) => (max === 1 ? "Só temos 1 unidade deste produto" : `Só temos ${max} unidades deste produto`);

  function addToBag(x, sz = "") {
    if (!x || out(x)) return false;
    if ((x.sizes || []).length && !sz) { openP(x); setTimeout(askSize, 350); return false; }
    const max = stockOf(x);
    if (inBagOf(x.id) >= max) { toast(limitMsg(max)); return false; }
    const key = `${x.id}|${sz}`;
    const it = bag.find((b) => b.key === key);
    if (it) it.qty++; else bag.push({ key, id: x.id, size: sz, qty: 1 });
    save(); drawBag(true);
    toast("Adicionado à sacola");
    return true;
  }

  function flyToBag(img) {
    if (reduce || !img) return;
    const target = mobile() ? $("#mb-bag") : $("#open-bag");
    const a = img.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const ghost = img.cloneNode(); ghost.className = "fly"; ghost.removeAttribute("loading");
    const s = Math.min(a.width, 120);
    Object.assign(ghost.style, { left: a.left + a.width / 2 - s / 2 + "px", top: a.top + a.height / 2 - s / 2 + "px", width: s + "px", height: s + "px" });
    document.body.appendChild(ghost);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    ghost.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.6}px, ${dy * 0.6 - 60}px) scale(.55)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0.4 },
    ], { duration: 700, easing: "cubic-bezier(.5,0,.3,1)" }).onfinish = () => ghost.remove();
  }

  function lines() {
    // sempre com preço e estoque atuais; tira o que esgotou ou saiu da loja
    return bag.map((b) => ({ ...b, p: byId(b.id) })).filter((b) => b.p && !out(b.p));
  }
  function drawBag(bump = false) {
    const ls = all.length ? lines() : [];
    const count = ls.reduce((s, b) => s + b.qty, 0);
    const r = calc(ls), total = r.total;
    $$(".count").forEach((c) => {
      c.textContent = count; c.classList.toggle("zero", !count);
      if (bump) { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }
    });
    $("#open-bag").setAttribute("aria-label", `Abrir sacola, ${count} ${count === 1 ? "item" : "itens"}`);
    $("#bag-total").textContent = money(total);
    const ds = Object.entries(r.used);
    $("#bag-disc").innerHTML = ds.length ? `<div><span>Subtotal</span><span>${money(r.sub)}</span></div>` + ds.map(([k, v]) => `<div class="d"><span>${esc(discName(k))}</span><span>-${money(v)}</span></div>`).join("") : "";
    couponMsg("bag", null);
    $("#bag-f").hidden = !ls.length;
    $("#bag-items").innerHTML = ls.length ? ls.map((b) => `
      <div class="bi" data-key="${esc(b.key)}">
        <img src="${pics(b.p)[0] || "img/logo.png"}" alt="">
        <div>
          <h3>${esc(b.p.name)}</h3>
          ${b.size ? `<span class="sz">Tamanho ${esc(b.size)}</span>` : ""}
          <div class="bi-row">
            <div class="qty"><button data-q="-1" aria-label="Diminuir quantidade">−</button><span>${b.qty}</span><button data-q="1" aria-label="Aumentar quantidade">+</button></div>
            <span class="bi-price">${money(b.p.price * b.qty)}</span>
          </div>
          <button class="rm" data-rm>Remover</button>
        </div>
      </div>`).join("")
      : `<div class="bag-empty"><p>Sua sacola está vazia. Adicione produtos para enviar o pedido de uma vez.</p><button class="btn dark" data-goshop>Ver produtos</button></div>`;

    const txt = ls.map((b) => `• ${b.qty}x ${b.p.name}${b.size ? ` (tamanho ${b.size})` : ""} - ${money(b.p.price * b.qty)}`).join("\n");
    // se todas as peças são do mesmo vendedor, o pedido vai pro WhatsApp dele; senão, da loja
    const sellers = [...new Set(ls.map((b) => digits(b.p.whatsapp) || digits(cfg.whatsapp)))];
    const seller = sellers.length === 1 ? sellers[0] : cfg.whatsapp;
    $("#bag-wa").href = wa(`Olá! Quero fazer este pedido:\n\n${txt}${ds.length ? `\n\nSubtotal: ${money(r.sub)}\n${discText(r)}` : ""}\n\nTotal: ${money(total)}\n\nPode confirmar a disponibilidade?`, seller);
    // Pix da sacola só aparece quando todas as peças usam a mesma chave
    const keys = [...new Set(ls.map((b) => pixKey(b.p.pix_key) || pixKey(cfg.pix_key)))];
    const pk = keys.length === 1 ? keys[0] : "";
    $("#bag-pixb").hidden = !pk;
    $("#bag-pix").hidden = true;
    $("#bag-pixb").onclick = () => {
      const box = $("#bag-pix");
      if (!box.hidden) { box.hidden = true; return; }
      logUse(r, "pix");
      renderPix(box, pk, total, `pedido com ${count} ${count === 1 ? "item" : "itens"}`, seller);
    };
  }
  $("#bag-items").addEventListener("click", (e) => {
    if (e.target.closest("[data-goshop]")) { closeBag(); $("#produtos").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); return; }
    const row = e.target.closest(".bi"); if (!row) return;
    const it = bag.find((b) => b.key === row.dataset.key); if (!it) return;
    const q = e.target.closest("[data-q]");
    if (q) {
      const p = byId(it.id), max = p ? stockOf(p) : 0;
      if (+q.dataset.q > 0 && inBagOf(it.id) >= max) { toast(limitMsg(max)); return; }
      it.qty += +q.dataset.q;
    }
    if (e.target.closest("[data-rm]") || it.qty <= 0) bag = bag.filter((b) => b !== it);
    save(); drawBag();
  });
  const bagEl = $("#bag");
  let bagFocus = null;
  function openBag() { bagFocus = document.activeElement; bagEl.classList.add("open"); document.body.classList.add("lock"); modalOn(true); setTimeout(() => $(".bag-h .x").focus({ preventScroll: true }), 50); }
  function closeBag() { bagEl.classList.remove("open"); document.body.classList.remove("lock"); modalOn(false); bagFocus?.focus?.({ preventScroll: true }); }
  $("#open-bag").addEventListener("click", openBag);
  $("#mb-bag").addEventListener("click", openBag);
  $("#bag-wa").addEventListener("click", () => logUse(calc(lines()), "whatsapp"));
  $$("[data-close-bag]").forEach((el) => el.addEventListener("click", closeBag));

  // ---------- busca ----------
  let searchTimer;
  function search(v) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = v.trim();
      renderGrid();
      if (query && mobile()) {
        const top = $("#produtos").getBoundingClientRect().top + scrollY - 70;
        if (Math.abs(scrollY - top) > 40) scrollTo({ top, behavior: "auto" });
      }
    }, 150);
  }
  $("#q").addEventListener("input", (e) => search(e.target.value));
  $("#mq").addEventListener("input", (e) => search(e.target.value));
  const ms = $("#msearch");
  $("#mb-search").addEventListener("click", () => { ms.classList.add("open"); $("#mq").focus(); });
  $("#msearch-close").addEventListener("click", () => { ms.classList.remove("open"); $("#mq").value = ""; search(""); });
  $("#mb-home").addEventListener("click", (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); });

  // ---------- aviso rápido ----------
  let tt;
  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2200); }

  // ---------- cliques gerais ----------
  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) {
      const img = add.closest(".card")?.querySelector(".c-img img");
      if (addToBag(byId(add.dataset.add))) flyToBag(img);
      return;
    }
    const op = e.target.closest("[data-open]");
    if (op) { openP(byId(op.dataset.open)); return; }
    const t = e.target.closest("[data-tab]");
    if (t) { setTab(t.dataset.tab); return; }
    if (e.target.closest("[data-clear]")) {
      query = ""; $("#q").value = ""; $("#mq").value = ""; ms.classList.remove("open"); setTab("Todos"); return;
    }
    if (e.target.closest("[data-reload]")) location.reload();
  });
  document.addEventListener("keydown", (e) => {
    if (sheet.classList.contains("open")) trapTab(e, panel);
    else if (bagEl.classList.contains("open")) trapTab(e, $(".bag-p"));
    if (e.key === "Escape") {
      if (sheet.classList.contains("open")) closeP();
      else if (bagEl.classList.contains("open")) closeBag();
      else if (ms.classList.contains("open")) $("#msearch-close").click();
    }
    if (sheet.classList.contains("open") && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const t = $("#p-track"); t.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * t.clientWidth, behavior: reduce ? "auto" : "smooth" });
    }
  });

  // ---------- aparecer ao rolar ----------
  const io = new IntersectionObserver((es) => es.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }), { threshold: 0.15 });
  $$(".rv").forEach((el) => (el.closest(".hero") ? setTimeout(() => el.classList.add("in"), 60) : io.observe(el)));
  addEventListener("resize", moveInd);

  $("#year").textContent = new Date().getFullYear();

  // ---------- início ----------
  drawBag();
  load().then(() => { renderAll(); drawBag(); }).catch((err) => {
    console.error(err);
    $("#grid").innerHTML = `<p class="empty">Não foi possível carregar os produtos agora. Verifique sua internet e <button data-reload>tente de novo</button>.</p>`;
    $("#feat").hidden = true;
  });
})();
