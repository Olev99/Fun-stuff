# Bygger index.html: fletter engine.js, main.js og merket (icon/mark.svg) inn i template.html.
# Skriver også sw.js (service worker) med forhåndslager-liste og VERSION = hash av alt som lagres, så et nytt bygg
# gir ny cache. Samme hash havner i index.html som BUILD.
import os, json, hashlib
d = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(d, '..')
r = lambda n: open(os.path.join(d, n), encoding='utf-8').read()
eng = r('engine.js').replace("if (typeof module !== 'undefined' && module.exports) module.exports = EngineCore;", '')
html = (r('template.html').replace('/*MARK*/', r('../icon/mark.svg').strip())
        .replace('/*ENGINE*/', eng).replace('/*MAIN*/', '<script>\n' + r('main.js') + '</script>'))
files = ['index.html', 'manifest.webmanifest', 'apple-touch-icon.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']
h = hashlib.sha256((html + r('sw.js')).encode('utf-8'))
for f in files[1:]:
    h.update(open(os.path.join(root, f), 'rb').read())
ver = h.hexdigest()[:12]
html = html.replace("'/*BUILD*/'", "'" + ver + "'")
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(html)
sw = r('sw.js').replace("'/*VERSION*/'", "'" + ver + "'").replace('/*FILES*/', json.dumps(files))
open(os.path.join(root, 'sw.js'), 'w', encoding='utf-8').write(sw)
print('index.html', len(html), 'bytes, version', ver)
