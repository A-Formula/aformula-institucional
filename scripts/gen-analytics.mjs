// gen-analytics.mjs — injeta GA4 (G-3GEYZT8XH5) com Consent Mode v2 + banner de cookies (LGPD)
// em TODAS as páginas: institucionais (patch no <head>) e artigos do blog (template-parts.head).
// Consent Mode padrão = NEGADO; analytics só dispara após o usuário aceitar. Escolha salva em
// localStorage('af-consent'). Idempotente via marcadores ANALYTICS:START/END.
// Uso: node scripts/gen-analytics.mjs   (banner é auto-criado por JS; requer 'unsafe-inline' no CSP — já presente)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GA_ID = 'G-3GEYZT8XH5';

const BLOCK = `<!-- ANALYTICS:START (gen-analytics.mjs — GA4 + Consent Mode + banner LGPD) -->
<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});
try{if(localStorage.getItem('af-consent')==='granted')gtag('consent','update',{analytics_storage:'granted'});}catch(e){}
gtag('js',new Date());gtag('config','${GA_ID}');
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
(function(){
  try{if(localStorage.getItem('af-consent'))return;}catch(e){}
  function mk(){
    if(document.getElementById('af-cookie'))return;
    var s=document.createElement('style');
    s.textContent='#af-cookie{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8e9;border-radius:16px;box-shadow:0 12px 40px rgba(6,50,55,.18);padding:20px 22px;font-family:Avenir,system-ui,sans-serif;color:#33484b}#af-cookie p{margin:0 0 14px;font-size:14px;line-height:1.5}#af-cookie a{color:#008896;text-decoration:underline}#af-cookie .af-row{display:flex;gap:10px;flex-wrap:wrap}#af-cookie button{flex:1;min-width:120px;border:0;border-radius:10px;padding:11px 16px;font-family:inherit;font-weight:900;font-size:13px;cursor:pointer}#af-cookie .af-ok{background:#008896;color:#fff}#af-cookie .af-no{background:#eef2f2;color:#33484b}@media(prefers-reduced-motion:no-preference){#af-cookie{animation:afck .35s ease both}}@keyframes afck{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}';
    document.head.appendChild(s);
    var d=document.createElement('div');d.id='af-cookie';d.setAttribute('role','dialog');d.setAttribute('aria-label','Aviso de cookies');
    d.innerHTML='<p>Usamos cookies para analisar o tráfego e melhorar sua experiência. Veja nossa <a href="/lgpd">Política de Privacidade</a>.</p><div class="af-row"><button class="af-ok" type="button">Aceitar</button><button class="af-no" type="button">Recusar</button></div>';
    document.body.appendChild(d);
    function close(v){try{localStorage.setItem('af-consent',v);}catch(e){}if(v==='granted'&&window.gtag)gtag('consent','update',{analytics_storage:'granted'});d.remove();}
    d.querySelector('.af-ok').addEventListener('click',function(){close('granted');});
    d.querySelector('.af-no').addEventListener('click',function(){close('denied');});
  }
  if(document.body)mk();else document.addEventListener('DOMContentLoaded',mk);
})();
</script>
<!-- ANALYTICS:END -->`;

const RE = /<!-- ANALYTICS:START[\s\S]*?<!-- ANALYTICS:END -->/;

// 1) páginas institucionais — injeta logo após <head> (consent cedo)
const PAGES = ['index.html','sobre-nos.html','contato.html','encontre-uma-loja.html','area-do-prescritor.html','pet.html','receita.html','blog.html','lgpd.html'];
let n = 0;
for (const file of PAGES) {
  const abs = path.join(ROOT, file);
  let h = fs.readFileSync(abs, 'utf-8');
  h = RE.test(h) ? h.replace(RE, BLOCK) : h.replace(/<head>/i, `<head>\n${BLOCK}`);
  fs.writeFileSync(abs, h);
  n++;
}

// 2) artigos do blog — injeta no template-parts.head (raw text, preserva o JSON)
const tpPath = path.join(ROOT, 'scripts/template-parts.json');
let raw = fs.readFileSync(tpPath, 'utf-8');
const escBlock = JSON.stringify('\n' + BLOCK).slice(1, -1); // escapa aspas/quebras p/ caber na string JSON
if (raw.includes('ANALYTICS:START')) {
  raw = raw.replace(/<!-- ANALYTICS:START[\s\S]*?ANALYTICS:END -->/, escBlock.replace(/^\\n/, ''));
} else {
  raw = raw.replace('<head>', `<head>${escBlock}`);
}
JSON.parse(raw); // valida que o JSON continua íntegro (lança se quebrou)
fs.writeFileSync(tpPath, raw);

console.log(`[analytics] GA4 ${GA_ID} + Consent Mode + banner injetados em ${n} páginas + template dos artigos.`);
