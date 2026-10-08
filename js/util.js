// Funções de segurança: escapam texto antes de ir para o HTML
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=u=>{try{const x=new URL(u);return x.protocol==="https:"?x.href.replace(/'/g,"%27").replace(/"/g,"%22").replace(/\(/g,"%28").replace(/\)/g,"%29"):""}catch{return""}};
const digits=s=>String(s??"").replace(/\D/g,"").slice(0,15);
const handle=s=>String(s??"").replace(/[^A-Za-z0-9._]/g,"").slice(0,30);
