// Funções de segurança: escapam texto antes de ir para o HTML
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=u=>{try{const x=new URL(u);return x.protocol==="https:"?x.href.replace(/'/g,"%27").replace(/"/g,"%22").replace(/\(/g,"%28").replace(/\)/g,"%29"):""}catch{return""}};
const digits=s=>String(s??"").replace(/\D/g,"").slice(0,15);
const handle=s=>String(s??"").replace(/[^A-Za-z0-9._]/g,"").slice(0,30);

// ---- Pix (BR Code estático) ----
const pixKey=s=>String(s??"").trim().replace(/[^A-Za-z0-9@.+_-]/g,"").slice(0,77);
const pixTxt=(s,n)=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9 ]/g,"").trim().slice(0,n);
const tlv=(i,v)=>i+String(v.length).padStart(2,"0")+v;
function crc16(s){let c=0xFFFF;for(let i=0;i<s.length;i++){c^=s.charCodeAt(i)<<8;for(let k=0;k<8;k++)c=c&0x8000?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF}return c.toString(16).toUpperCase().padStart(4,"0")}
function pixPayload(key,name,city,amount){
  let p=tlv("00","01")+tlv("01","11")+tlv("26",tlv("00","br.gov.bcb.pix")+tlv("01",key))+tlv("52","0000")+tlv("53","986");
  if(amount>0)p+=tlv("54",amount.toFixed(2));
  p+=tlv("58","BR")+tlv("59",pixTxt(name,25)||"LOJA")+tlv("60",pixTxt(city,15)||"SAO PAULO")+tlv("62",tlv("05","***"))+"6304";
  return p+crc16(p)}
