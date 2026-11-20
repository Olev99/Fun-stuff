import math
CX, CY, R1, R2, A0, A1, N, GAP = 32, 34.5, 20, 29, 135, 405, 12, 5
def pt(r, a):
    t = math.radians(a); return CX + r * math.cos(t), CY + r * math.sin(t)
def sector(r1, r2, a, b):
    p1, p2, p3, p4 = pt(r2, a), pt(r2, b), pt(r1, b), pt(r1, a)
    return 'M%.1f %.1fA%d %d 0 0 1 %.1f %.1fL%.1f %.1fA%d %d 0 0 0 %.1f %.1fZ' % (p1 + (r2, r2) + p2 + p3 + (r1, r1) + p4)
cls = {}
step = (A1 - A0) / N
for i in range(N):
    f = (i + .5) / N
    c = 'a' if f < .56 else 'w' if f < .76 else ('r' if f < .84 else 'd')
    cls.setdefault(c, []).append(sector(R1, R2, A0 + i * step + GAP / 2, A0 + (i + 1) * step - GAP / 2))
out = ''.join('<path class="m%s" d="%s"/>' % (c, ''.join(v)) for c, v in cls.items())
H = [.42, .78, 1, .62, .3]; BW, BG, HM = 2.6, 1.6, 15
x0 = CX - (5 * BW + 4 * BG) / 2
out += '<path class="mq" d="' + ''.join('M%.1f %.1fh%.1fv%.1fh-%.1fZ' % (x0 + i * (BW + BG), CY + 1 - h * HM / 2, BW, h * HM, BW) for i, h in enumerate(H)) + '"/>'
na = A0 + (A1 - A0) * .82; tip = pt(31, na); b = pt(13, na); p = math.radians(na + 90); w = 1.8
out += '<path class="mn" d="M%.1f %.1fL%.1f %.1fL%.1f %.1fZ"/>' % (tip + (b[0] + w * math.cos(p), b[1] + w * math.sin(p), b[0] - w * math.cos(p), b[1] - w * math.sin(p)))
print('<svg class="mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">' + out + '</svg>')
