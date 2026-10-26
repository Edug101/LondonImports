// Painel: cupons de desconto, "compre 2 ganhe 1" e relatório de quanto cada cupom economizou.
// Precisa das tabelas do arquivo sql/cupons.sql.
(()=>{
const $=id=>document.getElementById(id);
const PCTS=[10,15,20,25,30,35,40,45,50,55,60,65,70];
const code=s=>String(s??"").normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,30);
let prods=[],coupons=[],picked=new Set(),started=false;

$("c_pct").innerHTML=PCTS.map(p=>`<option value="${p}">${p}% de desconto</option>`).join("");
$("c_kind").onchange=()=>{$("c_pct_l").hidden=$("c_kind").value!=="percent"};
$("c_code").oninput=e=>{const v=code(e.target.value);if(v!==e.target.value)e.target.value=v};

function drawPicker(){
  $("c_list").innerHTML=prods.length?prods.map(x=>`<label class="c-item"><input type="checkbox" value="${esc(x.id)}"${picked.has(x.id)?" checked":""}><img src="${safeUrl(x.image_url)}" alt=""><span>${esc(x.name)}<small>${money(x.price)}</small></span></label>`).join(""):'<p class="msg">Cadastre produtos primeiro.</p>';
  $("c_all").textContent=prods.length&&picked.size===prods.length?"Desmarcar todos":"Marcar todos"}
$("c_list").onchange=e=>{const v=e.target.value;e.target.checked?picked.add(v):picked.delete(v);drawPicker()};
$("c_all").onclick=()=>{picked=picked.size===prods.length?new Set():new Set(prods.map(x=>x.id));drawPicker()};

const label=c=>c.kind==="b2g1"?"Compre 2 ganhe 1":`${c.percent}% de desconto`;
const nameOf=id=>(prods.find(p=>p.id===id)||{}).name;
function drawRows(){
  $("c_rows").innerHTML=coupons.length?coupons.map(c=>{
    const names=c.product_ids.map(nameOf).filter(Boolean);
    return `<div class="row c-row"><div><b>${esc(c.code)}</b>${c.active?"":' <span class="tag">pausado</span>'}<br><small>${label(c)} · ${names.length===prods.length&&prods.length?"todos os produtos":names.length+" produto"+(names.length===1?"":"s")}</small>${names.length&&names.length<prods.length?`<small class="c-names">${names.map(esc).join(", ")}</small>`:""}</div><button data-t="${esc(c.id)}">${c.active?"Pausar":"Ativar"}</button><button data-d="${esc(c.id)}">Excluir</button></div>`}).join("")
    :'<p class="msg">Nenhum cupom ainda.</p>'}

async function loadCoupons(){
  const r=await db.from("coupons").select("*").order("created_at",{ascending:false});
  if(r.error){$("c_msg").textContent="Falta criar as tabelas de cupom no Supabase (arquivo sql/cupons.sql).";coupons=[];drawRows();return}
  coupons=r.data||[];drawRows();loadReport()}

async function loadReport(){
  const r=await db.from("coupon_uses").select("code,discount,total,created_at").order("created_at",{ascending:false}).limit(5000);
  if(r.error){$("c_rep").innerHTML="";return}
  const by={};for(const u of r.data||[]){const k=by[u.code]||(by[u.code]={n:0,save:0,sold:0,last:u.created_at});k.n++;k.save+=+u.discount;k.sold+=+u.total}
  const rows=Object.entries(by).sort((a,b)=>b[1].save-a[1].save);
  if(!rows.length){$("c_rep").innerHTML='<p class="msg">Nenhum pedido com cupom ainda.</p>';return}
  const t=rows.reduce((s,[,k])=>({n:s.n+k.n,save:s.save+k.save,sold:s.sold+k.sold}),{n:0,save:0,sold:0});
  $("c_rep").innerHTML=`<div class="rep"><table><thead><tr><th>Cupom</th><th>Pedidos</th><th>Economizou</th><th>Vendido</th></tr></thead><tbody>${rows.map(([c,k])=>`<tr><td><b>${esc(c)}</b><small>último: ${new Date(k.last).toLocaleDateString("pt-BR")}</small></td><td>${k.n}</td><td class="save">${money(k.save)}</td><td>${money(k.sold)}</td></tr>`).join("")}</tbody><tfoot><tr><td>Total</td><td>${t.n}</td><td class="save">${money(t.save)}</td><td>${money(t.sold)}</td></tr></tfoot></table></div>`}

$("c_rows").onclick=async e=>{const d=e.target.dataset;
  if(d.t){const c=coupons.find(x=>x.id===d.t);await db.from("coupons").update({active:!c.active}).eq("id",d.t);loadCoupons()}
  if(d.d&&confirm("Excluir este cupom? O relatório do que ele já economizou continua guardado.")){await db.from("coupons").delete().eq("id",d.d);loadCoupons()}};

$("c_form").onsubmit=async e=>{e.preventDefault();
  const c=code($("c_code").value),kind=$("c_kind").value;
  if(c.length<2){$("c_msg").textContent="Dê um nome ao cupom (letras e números, sem espaço).";return}
  if(!picked.size){$("c_msg").textContent="Escolha pelo menos um produto.";return}
  const row={code:c,kind,percent:kind==="percent"?+$("c_pct").value:null,product_ids:[...picked],active:true};
  const r=await db.from("coupons").insert(row);
  if(r.error){$("c_msg").textContent=r.error.code==="23505"?"Já existe um cupom com esse nome.":"Erro ao salvar o cupom: "+r.error.message;return}
  $("c_msg").textContent=`Cupom ${c} criado.`;$("c_form").reset();$("c_pct_l").hidden=false;picked=new Set();drawPicker();loadCoupons()};

// o admin.js avisa quando a lista de produtos carrega
window.onProducts=list=>{const first=!started;started=true;prods=list;picked=new Set([...picked].filter(id=>list.some(p=>p.id===id)));drawPicker();first?loadCoupons():drawRows()};
})();
