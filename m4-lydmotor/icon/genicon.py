import math, sys
CX, CY = 512, 548
R1, R2 = 286, 376          # segment ring
A0, A1 = 135, 405          # degrees, clockwise from +x (y down)
N, GAP = 18, 3.2
NEEDLE = 0.835
BLUE, AMBER, RED = '#29b6ff', '#ffb020', '#ff2d2d'

def pt(r, a):
    t = math.radians(a)
    return CX + r * math.cos(t), CY + r * math.sin(t)

def sector(r1, r2, a, b):
    p1, p2, p3, p4 = pt(r2, a), pt(r2, b), pt(r1, b), pt(r1, a)
    return ('M%.1f %.1f A%d %d 0 0 1 %.1f %.1f L%.1f %.1f A%d %d 0 0 0 %.1f %.1f Z'
            % (p1[0], p1[1], r2, r2, p2[0], p2[1], p3[0], p3[1], r1, r1, p4[0], p4[1]))

def lerp(c1, c2, t):
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]; b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3))

def col(f):  # heat: accent -> amber -> red
    if f < 0.56: return BLUE
    if f < 0.67: return AMBER
    if f < 0.76: return '#ff6a1a'
    return RED

segs = []
step = (A1 - A0) / N
for i in range(N):
    a, b = A0 + i * step + GAP / 2, A0 + (i + 1) * step - GAP / 2
    f = (i + 0.5) / N
    lit = f <= NEEDLE
    c = col(f)
    segs.append('<path d="%s" fill="%s"%s/>' % (sector(R1, R2, a, b), c, '' if lit else ' opacity=".22"'))
    if lit:  # highlight on the outer edge
        segs.append('<path d="%s" fill="#fff" opacity=".28"/>' % sector(R2 - 10, R2, a, b))

# lit glow under the arc (blurred copy of the lit part)
glow_end = A0 + (A1 - A0) * NEEDLE
gp1, gp2 = pt((R1 + R2) / 2, A0), pt((R1 + R2) / 2, glow_end)
large = 1 if glow_end - A0 > 180 else 0

# minor tick ring inside
ticks = []
for k in range(0, 37):
    a = A0 + (A1 - A0) * k / 36
    major = k % 4 == 0
    r_in, r_out = (232, 262) if major else (248, 262)
    p, q = pt(r_in, a), pt(r_out, a)
    redz = k / 36 >= 0.76
    ticks.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="%d" stroke-linecap="butt" opacity="%s"/>'
                 % (p[0], p[1], q[0], q[1], RED if redz else '#cfd6e0', 9 if major else 5, '.95' if major else '.5'))

# needle: tapered blade from r=150 to r=392
na = A0 + (A1 - A0) * NEEDLE
tip = pt(400, na); base = pt(178, na)
perp = math.radians(na + 90)
w = 22
b1 = (base[0] + w * math.cos(perp), base[1] + w * math.sin(perp))
b2 = (base[0] - w * math.cos(perp), base[1] - w * math.sin(perp))
needle = 'M%.1f %.1f L%.1f %.1f L%.1f %.1f Z' % (tip[0], tip[1], b1[0], b1[1], b2[0], b2[1])

# equaliser bars
H = [0.42, 0.78, 1.0, 0.62, 0.30]
BW, BG, HMAX = 36, 16, 210
x0 = CX - (5 * BW + 4 * BG) / 2
eq = []
for i, h in enumerate(H):
    hh = h * HMAX
    x = x0 + i * (BW + BG); y = CY + 20 - hh / 2
    eq.append('<rect x="%.1f" y="%.1f" width="%d" height="%.1f" rx="%d" fill="url(#eqg)"/>' % (x, y, BW, hh, BW // 2))

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs>
  <radialGradient id="bg" cx="50%" cy="46%" r="70%">
    <stop offset="0" stop-color="#1b1f26"/><stop offset=".55" stop-color="#0d0f13"/><stop offset="1" stop-color="#050607"/>
  </radialGradient>
  <pattern id="cf" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="12" height="12" fill="#ffffff" opacity=".025"/><rect x="12" y="12" width="12" height="12" fill="#ffffff" opacity=".025"/>
    <rect x="12" width="12" height="12" fill="#000" opacity=".3"/><rect y="12" width="12" height="12" fill="#000" opacity=".3"/>
  </pattern>
  <radialGradient id="vig" cx="50%" cy="50%" r="72%">
    <stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/>
  </radialGradient>
  <radialGradient id="core" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="{BLUE}" stop-opacity=".22"/><stop offset="1" stop-color="{BLUE}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="eqg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c9ecff"/><stop offset=".35" stop-color="{BLUE}"/><stop offset="1" stop-color="#1480c4"/>
  </linearGradient>
  <linearGradient id="ndl" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe6ee"/>
  </linearGradient>
  <filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>
  <filter id="nblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
</defs>
<rect width="1024" height="1024" fill="url(#bg)"/>
<rect width="1024" height="1024" fill="url(#cf)"/>
<rect width="1024" height="1024" fill="url(#vig)"/>
<g id="art">
  <circle cx="{CX}" cy="{CY}" r="250" fill="url(#core)"/>
  <path d="M{gp1[0]:.1f} {gp1[1]:.1f} A{(R1+R2)//2} {(R1+R2)//2} 0 {large} 1 {gp2[0]:.1f} {gp2[1]:.1f}" fill="none" stroke="{BLUE}" stroke-width="{R2-R1}" opacity=".35" filter="url(#blur)"/>
  {''.join(segs)}
  {''.join(ticks)}
  {''.join(eq)}
  <path d="{needle}" fill="#ff2d2d" opacity=".75" filter="url(#nblur)"/>
  <path d="{needle}" fill="url(#ndl)"/>
  <circle cx="{base[0]:.1f}" cy="{base[1]:.1f}" r="{w}" fill="#ffffff"/>
</g>
</svg>
'''
open(sys.argv[1], 'w').write(svg)
