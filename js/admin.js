const $=id=>document.getElementById(id);let editing=null,items=[],imgs=[];
async function gate(){const{data:{session}}=await db.auth.getSession();$("login").hidden=!!session;$("app").hidden=!session;$("out").hidden=!session;
  if(session){const{data:ok}=await db.rpc("is_admin");if(!ok){await db.auth.signOut();$("login").hidden=false;$("app").hidden=true;$("out").hidden=true;$("lm").textContent="Esta conta não tem acesso ao painel.";return}
    load();const{data}=await db.from("settings").select("*").eq("id",1).single();if(data){$("s_wa").value=data.whatsapp||"";$("s_ig").value=data.instagram||"";$("s_pix").value=data.pix_key||"";$("s_pn").value=data.pix_name||"";$("s_pc").value=data.pix_city||""}}}
let fails=0,lock=0;
$("go").onclick=async()=>{
  if(Date.now()<lock){$("lm").textContent="Muitas tentativas. Aguarde "+Math.ceil((lock-Date.now())/1000)+"s.";return}
  const{error}=await db.auth.signInWithPassword({email:$("em").value.trim(),password:$("pw").value});
  if(error){fails++;if(fails>=5){lock=Date.now()+60000;fails=0}}else fails=0;
  $("lm").textContent=error?"E-mail ou senha incorretos.":"";$("pw").value="";gate()};
$("out").onclick=async()=>{await db.auth.signOut();gate()};
function thumbs(){$("thumbs").innerHTML=imgs.map((u,i)=>`<div data-c="${i}" class="${i?"":"cover"}" style="background-image:url('${safeUrl(u)}')" title="Clique para tornar capa">${i?"":"<small>CAPA</small>"}<b data-r="${i}" title="Remover">×</b></div>`).join("")}
$("thumbs").onclick=e=>{const r=e.target.dataset.r;if(r!==undefined){imgs.splice(+r,1);thumbs();return}const c=e.target.closest("[data-c]");if(c){imgs.unshift(imgs.splice(+c.dataset.c,1)[0]);thumbs()}};
async function load(){const{data}=await db.from("products").select("*").order("created_at",{ascending:false});items=data||[];window.onProducts&&window.onProducts(items);
  $("list").innerHTML=items.length?items.map(x=>`<div class="row"><img src="${safeUrl(x.image_url)}" alt=""><div><b>${esc(x.name)}</b><br><small>${money(x.price)}${x.active?"":" · oculto"}${x.featured?" · destaque":""}${x.popular?" · mais pedido":""}${(x.stock??1)<=0?" · ESGOTADO":" · estoque "+(x.stock??1)}${x.whatsapp?" · vendedor próprio":""}</small></div><button data-e="${esc(x.id)}">Editar</button><button data-d="${esc(x.id)}">Excluir</button></div>`).join(""):'<p class="msg">Nenhum produto ainda. Cadastre o primeiro acima.</p>'}
$("list").onclick=async e=>{const d=e.target.dataset;
  if(d.d&&confirm("Excluir este produto?")){await db.from("products").delete().eq("id",d.d);load()}
  if(d.e){const x=items.find(i=>i.id===d.e);editing=x.id;$("ft").textContent="Editando produto";$("cancel").hidden=false;
    ["name","brand","category","price","old_price","description"].forEach(k=>$(k).value=x[k]??"");$("sizes").value=(x.sizes||[]).join(", ");$("pwa").value=x.whatsapp||"";$("ppix").value=x.pix_key||"";
    $("featured").checked=x.featured;$("popular").checked=!!x.popular;$("stock").value=x.stock??1;$("active").checked=x.active;
    imgs=[...(x.images&&x.images.length?x.images:(x.image_url?[x.image_url]:[]))];thumbs();scrollTo(0,0)}};
$("cancel").onclick=reset;
function reset(){editing=null;$("form").reset();imgs=[];thumbs();$("active").checked=true;$("ft").textContent="Novo produto";$("cancel").hidden=true}
async function shrink(f){
  try{const b=await createImageBitmap(f);const k=Math.min(1,1400/Math.max(b.width,b.height));const w=Math.round(b.width*k),h=Math.round(b.height*k);
    const c=document.createElement("canvas");c.width=w;c.height=h;const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,w,h);g.drawImage(b,0,0,w,h);
    const o=await new Promise(r=>c.toBlob(r,"image/webp",.86));
    if(o&&o.type==="image/webp"&&o.size<f.size)return new File([o],"foto.webp",{type:"image/webp"})}catch(e){}
  return f}
$("form").onsubmit=async e=>{e.preventDefault();$("msg").textContent="Salvando...";
  const files=[...$("file").files];
  if(imgs.length+files.length>12){$("msg").textContent="Máximo de 12 fotos por produto.";return}
  for(const f of files)if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size>20*1024*1024){$("msg").textContent="Foto inválida: use JPG, PNG ou WEBP de até 20 MB.";return}
  const pw=digits($("pwa").value);
  if($("pwa").value.trim()&&(pw.length<10||pw.length>15)){$("msg").textContent="WhatsApp inválido. Use DDI + DDD + número.";return}
  const urls=[];
  let n=0;for(const f0 of files){n++;$("msg").textContent="Enviando foto "+n+" de "+files.length+"...";const f=await shrink(f0);if(f.size>5*1024*1024){$("msg").textContent="Foto muito grande mesmo depois de reduzir. Use outra.";return}const path=`${Date.now()}-${crypto.randomUUID().slice(0,8)}.${f.type.split("/")[1]}`;const up=await db.storage.from("products").upload(path,f);if(up.error){$("msg").textContent="Erro ao enviar a foto: "+up.error.message;return}urls.push(db.storage.from("products").getPublicUrl(path).data.publicUrl)}
  const all=[...imgs,...urls];
  const row={name:$("name").value,brand:$("brand").value,category:$("category").value,description:$("description").value,price:+$("price").value,old_price:$("old_price").value?+$("old_price").value:null,sizes:$("sizes").value.split(",").map(s=>s.trim()).filter(Boolean),whatsapp:pw||null,pix_key:pixKey($("ppix").value)||null,images:all,image_url:all[0]||null,featured:$("featured").checked,popular:$("popular").checked,stock:Math.max(0,Math.min(100000,parseInt($("stock").value,10)||0)),active:$("active").checked};
  const r=editing?await db.from("products").update(row).eq("id",editing):await db.from("products").insert(row);
  $("msg").textContent=r.error?"Erro: "+r.error.message:"Produto salvo.";if(!r.error){reset();load()}};
$("s_save").onclick=async()=>{const r=await db.from("settings").update({whatsapp:digits($("s_wa").value),instagram:handle($("s_ig").value),pix_key:pixKey($("s_pix").value)||null,pix_name:pixTxt($("s_pn").value,25)||"LONDON IMPORTS",pix_city:pixTxt($("s_pc").value,15)||"SAO PAULO"}).eq("id",1);$("s_msg").textContent=r.error?"Erro ao salvar (use DDI+DDD+número).":"Loja atualizada."};
gate();