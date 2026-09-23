# build-lps.py — gera as landing pages do dominio oficial (www.aformulabr.com.br/orcamento-*/)
#
# Fontes:
#   - LPs do modelo A Formula: repositorio a-formula-lps (pasta-mae deste repo no Drive),
#     landing-pages/{pasta}/index.html + assets/ e videos/ compartilhados (caminhos ../../).
#   - scripts/lps/src/: versoes que NAO estao no a-formula-lps (Foz do ar em 18/09, Tatuape,
#     Santa Cruz "diferenciais" + "kits e brindes"). Os assets delas ja estao publicados em
#     lp_assets/ — src/asset-map.json liga cada referencia original ao arquivo publicado.
#
# O que faz em cada pagina:
#   Tailwind CDN -> CSS compilado (um arquivo por configuracao) · assets -> /lp_assets/ sem
#   repeticao (dedupe por md5) · URLs antigas -> dominio oficial · GTM do Petson (se faltar)
#   · bloco legal da matriz (copiado do pet.html) dentro da coluna do rodape.
#
# Uso (na raiz do repo):  python scripts/lps/build-lps.py [--af CAMINHO_DO_a-formula-lps]
# Requer node (npx tailwindcss@3.4.17). Idempotente: rodar sem mudar fonte = git status limpo.
import re, os, sys, json, hashlib, subprocess, tempfile, shutil, urllib.parse

INST = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(INST, 'scripts', 'lps', 'src')
AF = sys.argv[sys.argv.index('--af') + 1] if '--af' in sys.argv else os.path.dirname(INST)
LPS = os.path.join(AF, 'landing-pages')
BASE, OUT = 'https://www.aformulabr.com.br', 'lp_assets'
OUTDIR = os.path.join(INST, OUT)
GTM_ID = 'GTM-PXZXNBZ'

def af(key, slug, old, src=None, farm_old=None):
    return dict(key=key, slug=slug, old=old, src=src or os.path.join(LPS, key, 'index.html'), mode='af', farm_old=farm_old)
# pasta/fonte -> slug publico. `old` = rota antiga no a-formula-br.vercel.app; `farm_old` = rota
# antiga no farmacia.aformulabr.com.br quando diferente do slug novo.
SOURCES = [
    af('conquista', 'orcamento-vitoriadaconquista', 'conquista'),
    af('belem', 'orcamento-belem', 'belem'),
    af('brooklin', 'orcamento-brooklin', 'brooklin'),
    af('ipiau', 'orcamento-ipiau', 'ipiau'),
    af('natal', 'orcamento-natal', 'natal'),
    af('tofacitinibe-baricitinibe', 'orcamento-riodejaneiro-tofacitinibeebaricitinibe', 'tofacitinibe-baricitinibe', farm_old='tofacitinibeebaricitinibe'),
    af('scs', 'orcamento-santacruzdosul', 'scs', farm_old='a-formula-scs-live'),
    af('bh', 'orcamento-belohorizonte', 'bh'),
    af('foz', 'orcamento-foz-do-iguacu', 'foz', src=os.path.join(SRC, 'foz-live.html')),
    dict(key='tatuape', slug='orcamento-tatuape', mode='rel', root=os.path.join(SRC, 'tatuape'),
         pages={'index.html': ''}, urls={'https://a-formula-tatuape.vercel.app/': '{BASE}/{slug}/'}),
    dict(key='scs-diferenciais', slug='orcamento-santacruzdosul-diferenciais', mode='rel', root=os.path.join(SRC, 'scs-diferenciais'),
         pages={'index.html': 'orcamento-santacruzdosul-diferenciais', 'kits-e-brindes.html': 'orcamento-santacruzdosul-kitsebrindes'}, urls={}),
]

# Troca de imagem por pagina (so nas <img>; og:image/schema seguem PNG pra previa de WhatsApp/Facebook).
# Natal: WebP da versao otimizada que estava no ar (farmacia, 16/06). Ativos = os WebP ja publicados.
SWAP = {
    'natal': {
        'assets/fachada-natal.png': os.path.join(SRC, 'natal', 'fachada-natal.webp'),
        'assets/modelo-formula-natal.png': os.path.join(SRC, 'natal', 'modelo-formula-natal.webp'),
        'assets/timeline-1.jpeg': os.path.join(SRC, 'natal', 'timeline-1.webp'),
        'assets/scs-ativo-peptideos.png': os.path.join(AF, 'assets', 'scs-ativo-peptideos.webp'),
        'assets/scs-ativo-exossomos.png': os.path.join(AF, 'assets', 'scs-ativo-exossomos.webp'),
        'assets/scs-ativo-retinol.png': os.path.join(AF, 'assets', 'scs-ativo-retinol.webp'),
        'assets/scs-ativo-vitc.png': os.path.join(AF, 'assets', 'scs-ativo-vitc.webp'),
    },
}

GTM = open(os.path.join(SRC, 'gtm-petson.html'), encoding='utf-8').read()
GTM_HEAD = re.search(r'<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->', GTM).group(0)
GTM_BODY = re.search(r'<!-- Google Tag Manager \(noscript\) -->[\s\S]*?<!-- End Google Tag Manager \(noscript\) -->', GTM).group(0)
LEGAL = re.search(r'<!-- LEGAL:START[\s\S]*?<!-- LEGAL:END -->', open(os.path.join(INST, 'pet.html'), encoding='utf-8').read()).group(0)
LP_CSS = ('.footer__legal--lp{margin-top:32px}\n'
          '.footer__legal--lp .footer__legal-inner{max-width:none;padding-left:0;padding-right:0}\n')
TW_CDN = re.compile(r'[ \t]*<script src="https://cdn\.tailwindcss\.com"></script>\s*<script>\s*tailwind\.config\s*=\s*(\{[\s\S]*?\})\s*;?\s*</script>')
AMAP = json.load(open(os.path.join(SRC, 'asset-map.json'), encoding='utf-8'))
md5 = lambda b: hashlib.md5(b).hexdigest()

# ---- assets: um arquivo por conteudo ----
os.makedirs(OUTDIR, exist_ok=True)
by_hash = {md5(open(os.path.join(r, f), 'rb').read()): '/' + OUT + '/' + urllib.parse.quote(os.path.relpath(os.path.join(r, f), OUTDIR).replace(os.sep, '/'))
           for r, _, fs in os.walk(OUTDIR) for f in fs if not f.endswith('.css')}
used_urls = set()
def publish(src_file, want_rel):
    b = open(src_file, 'rb').read(); h = md5(b)
    if h not in by_hash:
        dst = os.path.join(OUTDIR, want_rel)
        assert not os.path.exists(dst), ('nome ja usado por outro conteudo — renomeie o arquivo', want_rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, 'wb').write(b)
        by_hash[h] = f'/{OUT}/' + urllib.parse.quote(want_rel.replace(os.sep, '/'))
        print('  novo asset:', want_rel)
    used_urls.add(by_hash[h]); return by_hash[h]

def absolutos(h):
    # og:image/twitter:image e JSON-LD precisam de URL completa (previa de WhatsApp/Facebook, Google)
    h = re.sub(r'(<meta\s[^>]*content=")(/' + OUT + r'/)', lambda m: m.group(1) + BASE + m.group(2), h)
    return re.sub(r'<script type="application/ld\+json">[\s\S]*?</script>',
                  lambda m: m.group(0).replace(f'"/{OUT}/', f'"{BASE}/{OUT}/'), h)

def common(h, slug):
    h = absolutos(h)
    m = TW_CDN.search(h); assert m and len(TW_CDN.findall(h)) == 1, slug
    cfg = re.sub(r'\s', '', m.group(1))
    h = TW_CDN.sub('    <link rel="stylesheet" href="__CSS__">', h, 1)
    if GTM_ID not in h:
        assert h.count('<head>') == 1 and len(re.findall(r'<body[^>]*>', h)) == 1, slug
        h = h.replace('<head>', '<head>\n' + GTM_HEAD, 1)
        h = re.sub(r'(<body[^>]*>)', lambda x: x.group(1) + '\n' + GTM_BODY, h, 1)
    assert h.count('</footer>') == 1, slug
    fm = re.search(r'</div>(\s*)</footer>', h); assert fm, slug
    blk = LEGAL.replace('footer__legal footer__legal--escuro', 'footer__legal footer__legal--escuro footer__legal--lp', 1).replace('  </style>', LP_CSS + '  </style>', 1)
    return h[:fm.start()] + blk + '\n' + h[fm.start():], m.group(1), cfg

pages = []
for s in SOURCES:
    slug = s['slug']
    if s['mode'] == 'af':
        h = open(s['src'], encoding='utf-8').read()
        # troca de imagem ANTES de absolutas virarem relativas (og:image/schema absolutos ficam intactos)
        for orig, novo in SWAP.get(s['key'], {}).items():
            n = h.count('../../' + orig); assert n >= 1, (s['key'], orig)
            h = h.replace('../../' + orig, publish(novo, os.path.basename(novo)))
        h = h.replace('https://a-formula-br.vercel.app/assets/', '../../assets/')
        h = h.replace(f"https://a-formula-br.vercel.app/{s['old']}/", f'{BASE}/{slug}/')
        h = h.replace(f'https://farmacia.aformulabr.com.br/{slug}/', f'{BASE}/{slug}/')
        if s['farm_old']: h = h.replace(f"https://farmacia.aformulabr.com.br/{s['farm_old']}/", f'{BASE}/{slug}/')
        h = h.replace('https://farmacia.aformulabr.com.br/#rj', f'{BASE}/{slug}/#rj')
        h = h.replace('https://a-formula-br.vercel.app/#organization', f'{BASE}/#organization')
        refs = set(re.findall(r'\.\./\.\./((?:assets|videos)/[^"\')\s?#]+)', re.sub(r'<!--[\s\S]*?-->', '', h)))
        for r in list(refs):  # miniaturas montadas por JS: img.replace(/\.webp$/, "-thumb.webp")
            t = re.sub(r'\.webp$', '-thumb.webp', r)
            if t != r and os.path.exists(os.path.join(AF, t)): refs.add(t)
        for r in sorted(refs):
            h = h.replace('../../' + r, publish(os.path.join(AF, r), r[len('assets/'):] if r.startswith('assets/') else r))
        h = h.replace('../../assets/', f'/{OUT}/').replace('../../videos/', f'/{OUT}/videos/')  # sobras em comentarios/JS
        h, raw, cfg = common(h, slug)
        pages.append((slug, h, raw, cfg))
    else:
        for fname, pslug in s['pages'].items():
            pslug = pslug or slug
            h = open(os.path.join(s['root'], fname), encoding='utf-8').read()
            # asset em URL absoluta do deploy antigo (og:image/schema) -> URL completa do publicado
            for a in s['urls']:
                h = re.sub(re.escape(a) + r'(assets/[^"\')\s?#]+)', lambda m: BASE + '/' + OUT + '/' + urllib.parse.quote(AMAP[f"{s['key']}:{urllib.parse.unquote(m.group(1))}"]), h)
            for a, b in s['urls'].items(): h = h.replace(a, b.format(BASE=BASE, slug=pslug))
            def rep(m):
                url = '/' + OUT + '/' + urllib.parse.quote(AMAP[f"{s['key']}:{urllib.parse.unquote(m.group(2))}"])
                used_urls.add(url); return m.group(1) + url
            h = re.sub(r'''(["'(])(?:\./)?(assets/[^"')?#]+)''', rep, h)
            for f2, s2 in s['pages'].items():  # links entre paginas da mesma LP
                s2 = s2 or slug
                h = h.replace(f'href="{f2}#', 'href="#' if s2 == pslug else f'href="/{s2}/#').replace(f'href="{f2}"', f'href="/{s2}/"')
            assert not re.search(r'href="[a-z-]+\.html', h), pslug
            h, raw, cfg = common(h, pslug)
            pages.append((pslug, h, raw, cfg))
for slug, h, _, _ in pages:
    left = re.findall(r'https://(?:a-formula-br\.vercel\.app|farmacia\.aformulabr\.com\.br|a-formula-tatuape\.vercel\.app)[^"\' <)]*', h)
    assert not left, (slug, left)

# ---- CSS por configuracao do Tailwind ----
groups = {}
for p in pages: groups.setdefault(p[3], []).append(p)
main_cfg = next(p[3] for p in pages if p[0] == 'orcamento-belem')
css_url = {}
for cfg, ps in groups.items():
    name = 'lp' if cfg == main_cfg else 'lp-' + ps[0][0].replace('orcamento-', '')
    tw = tempfile.mkdtemp(prefix='tw-')
    try:
        for i, p in enumerate(ps): open(os.path.join(tw, f'p{i}.html'), 'w', encoding='utf-8').write(p[1])
        open(os.path.join(tw, 'tailwind.config.js'), 'w', encoding='utf-8').write(f"module.exports = {{ content: ['./*.html'], ...{ps[0][2]} }};\n")
        open(os.path.join(tw, 'in.css'), 'w').write('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n')
        subprocess.run('npx --yes tailwindcss@3.4.17 -c tailwind.config.js -i in.css -o out.css --minify', cwd=tw, shell=True, check=True, capture_output=True)
        css = open(os.path.join(tw, 'out.css'), 'rb').read()
    finally:
        shutil.rmtree(tw, ignore_errors=True)
    open(os.path.join(OUTDIR, name + '.css'), 'wb').write(css)
    css_url[cfg] = f'/{OUT}/{name}.css?v={md5(css)[:8]}'
    print(f'css {name}.css {len(css)//1024} KB <- {len(ps)} paginas')

for slug, h, _, cfg in pages:
    d = os.path.join(INST, slug); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8', newline='\n').write(h.replace('__CSS__', css_url[cfg]))
orfaos = sorted(u for u in by_hash.values() if u not in used_urls)
print(f'{len(pages)} paginas geradas | assets em uso: {len(used_urls)} | sem uso em lp_assets: {len(orfaos)}')
for u in orfaos: print('  sem uso:', u)
