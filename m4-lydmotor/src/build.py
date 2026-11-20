# Bygger index.html: fletter engine.js, main.js og merket (icon/mark.svg) inn i template.html.
import os
d = os.path.dirname(os.path.abspath(__file__))
r = lambda n: open(os.path.join(d, n), encoding='utf-8').read()
eng = r('engine.js').replace("if (typeof module !== 'undefined' && module.exports) module.exports = EngineCore;", '')
html = (r('template.html').replace('/*MARK*/', r('../icon/mark.svg').strip())
        .replace('/*ENGINE*/', eng).replace('/*MAIN*/', '<script>\n' + r('main.js') + '</script>'))
open(os.path.join(d, '..', 'index.html'), 'w', encoding='utf-8').write(html)
print('index.html', len(html), 'bytes')
