let all=[],cat="home",cfg={whatsapp:"",instagram:""},size="";
const $=id=>document.getElementById(id);
const wa=(t,n)=>`https://wa.me/${digits(n||cfg.whatsapp)}?text=${encodeURIComponent(t)}`;
const bg=u=>{const s=safeUrl(u);return s?`url('${s}')`:"none"};
$("tk").innerHTML=("IMPORTADOS ORIGINAIS &nbsp;✦&nbsp; DO MUNDO PARA VOCÊ &nbsp;✦&nbsp; ENTREGA COM ACOMPANHAMENTO &nbsp;✦&nbsp; ".repeat(6));
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.1});
document.querySelector(".x").onclick=()=>dlg.close();
function view(){const f=cat!=="home"||!!$("q").value.trim();document.querySelector(".hero").style.display=f?"none":"";document.querySelector(".tick").style.display=f?"none":"";document.body.classList.toggle("filtered",f)}
async function init(){
  $("nav").onclick=e=>{const c=e.target.dataset.c;if(!c)return;cat=c;[...$("nav").children].forEach(b=>b.classList.toggle("on",b.dataset.c===cat));$("st").textContent=e.target.textContent.replace(" 🔥","");draw();view();scrollTo(0,0)};
  $("seecat").onclick=e=>{e.preventDefault();document.querySelector('#nav [data-c="Todos"]').click()};
  $("q").oninput=()=>{draw();view();scrollTo(0,0)};
  const [p,s]=await Promise.all([db.from("products").select("id,name,brand,category,description,price,old_price,sizes,image_url,images,whatsapp,featured,popular").eq("active",true).order("featured",{ascending:false}).order("created_at",{ascending:false}),db.from("settings").select("whatsapp,instagram").eq("id",1).single()]);
  if(p.error){all=[];$("grid").innerHTML='<p class="empty">Catálogo indisponível. Confira a URL e a anon key em js/config.js.</p>';return}
  all=p.data;if(s.data)cfg=s.data;
  $("wpp").href=wa("Olá! Vim pelo site da London Imports.");
  if(handle(cfg.instagram)){const u=handle(cfg.instagram);$("ig").innerHTML=`· <a href="https://instagram.com/${u}">@${u}</a>`}
  const f=all.find(x=>x.featured&&x.image_url);
  if(f){$("feat").classList.remove("fb");$("fimg").innerHTML="";$("fimg").style.backgroundImage=bg(f.image_url);$("feat").onclick=()=>openP(f);$("cap").hidden=false;$("cap").innerHTML=`<small>Lançamento exclusivo</small><b>${esc(f.name)}</b><span class="price">${money(f.price)}</span>`}
  draw();
}
function draw(){
  const q=$("q").value.toLowerCase();
  const l=all.filter(x=>(cat==="Todos"||cat==="home"||(cat==="pop"?x.popular:x.category===cat))&&(x.name+" "+(x.brand||"")).toLowerCase().includes(q));
  $("cnt").textContent=l.length+(l.length===1?" item":" itens");
  $("grid").innerHTML=l.length?l.map(x=>`<button class="card" data-id="${esc(x.id)}"><span class="c"><span class="ph" style="background-image:${bg(x.image_url)}"><i></i>${x.popular?'<span class="tag pop">Mais pedido</span>':x.old_price>x.price?'<span class="tag">Oferta</span>':""}</span><span class="inf"><small>${esc(x.brand)}</small><h3>${esc(x.name)}</h3>${x.old_price>x.price?`<span class="old">${money(x.old_price)}</span>`:""}<span class="price">${money(x.price)}</span></span></span></button>`).join(""):'<p class="empty">Nenhum produto nesta seção ainda.</p>';
  document.querySelectorAll(".card").forEach(c=>io.observe(c));
}
$("grid").onclick=e=>{const c=e.target.closest(".card");if(c)openP(all.find(x=>x.id===c.dataset.id))};
function openP(x){
  size="";const g=x.images&&x.images.length?x.images:(x.image_url?[x.image_url]:[]);
  const show=i=>{$("m-ph").style.backgroundImage=bg(g[i]);[...$("m-th").children].forEach((t,k)=>t.classList.toggle("on",k===i))};
  $("m-th").innerHTML=g.length>1?g.map((u,i)=>`<i data-i="${i}" style="background-image:${bg(u)}"></i>`).join(""):"";
  $("m-th").onclick=e=>{if(e.target.dataset.i!==undefined)show(+e.target.dataset.i)};show(0);
  $("m-b").textContent=x.brand||"";$("m-n").textContent=x.name;
  $("m-p").innerHTML=(x.old_price>x.price?`<span class="old">${money(x.old_price)}</span>`:"")+`<span class="price">${money(x.price)}</span>`;
  $("m-d").textContent=x.description||"";
  $("m-s").innerHTML=(x.sizes||[]).map(s=>`<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join("");
  const upd=()=>$("m-buy").href=wa(`Olá! Tenho interesse em: ${x.name}${size?" (tam. "+size+")":""} - ${money(x.price)}`,x.whatsapp);upd();
  $("m-s").onclick=e=>{if(e.target.dataset.s){size=e.target.dataset.s;[...$("m-s").children].forEach(b=>b.classList.toggle("on",b.dataset.s===size));upd()}};
  dlg.showModal();
}
init();
