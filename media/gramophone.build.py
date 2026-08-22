# Rebuilds media/gramophone.svg from the Illustrator export.
# Every original gradient and every one of its stops is kept exactly where it
# was — that is the modelling, and it is the artwork's. Only the colour of a
# stop is rewritten: to its own lightness within its material's range, mixed
# between two ends the page supplies as custom properties. So the machine can
# be copper by day and pewter after dark without losing a single highlight.
#
#     python3 media/gramophone.build.py
#
# reads media/gramophone.source.svg — the untouched Illustrator export, kept so
# the mapping below can be changed and the drawing rebuilt without anything
# being lost — and writes media/gramophone.svg.
import io, os, re, collections
HERE = os.path.dirname(os.path.abspath(__file__))
src = io.open(os.path.join(HERE, 'gramophone.source.svg'), encoding='utf-8').read()

BRASS = 'st76 st25 st29 st26 st31 st32 st33 st34 st35 st37 st39 st23 st14 st16 st22 st17 st19 st24 st59 st27 st75 st28 st30 st79 st36 st67 st38 st13 st12 st15 st20 st66 st60'.split()
STEEL = 'st8 st7 st21 st18 st48 st44 st47 st43 st50 st45 st46 st4 st51 st42 st40 st41 st57 st54 st58 st52 st53 st65 st78 st61 st3 st2 st5 st10'.split()
WOOD  = 'st77 st9 st62 st6 st1 st49 st11 st64 st80'.split()
INK   = 'st69 st70 st68 st71 st74 st72 st73 st56'.split()
MAT = {}
for g, n in ((BRASS,'brass'), (STEEL,'steel'), (WOOD,'wood'), (INK,'ink')):
    for k in g: MAT[k] = n
MAT['st55'] = 'label'
CRANK = set('st61 st3 st2 st5 st10'.split())

style = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
decl = dict(re.findall(r'\.(st\d+)\s*\{\s*fill:\s*([^;]+);', style))
gmat = {}
for cls, val in decl.items():
    m = re.match(r'url\(#([^)]+)\)', val.strip())
    if m: gmat[m.group(1)] = MAT.get(cls, 'steel')
for gid, href in re.findall(r'id="([^"]+)"[^>]*xlink:href="#([^"]+)"', src):
    if href in gmat: gmat.setdefault(gid, gmat[href])

def lum(h):
    h = h.strip().lstrip('#')
    if len(h) == 3: h = ''.join(c*2 for c in h)
    r, g, b = (int(h[i:i+2], 16)/255 for i in (0, 2, 4))
    f = lambda c: c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b)

defs = re.sub(r'<style>.*?</style>', '', re.search(r'<defs>(.*?)</defs>', src, re.S).group(1), flags=re.S)
tok = re.split(r'(<(?:linear|radial)Gradient\b[^>]*>|<stop\b[^>]*/?>)', defs)

L, cur = collections.defaultdict(list), None
for t in tok:
    if t[:15] in ('<linearGradient', '<radialGradient'):
        m = re.search(r'id="([^"]+)"', t); cur = gmat.get(m.group(1)) if m else None
    elif t.startswith('<stop') and cur:
        c = re.search(r'stop-color="(#[0-9a-fA-F]{3,6})"', t)
        if c: L[cur].append(lum(c.group(1)))
for cls, v in decl.items():
    if v.strip().startswith('#'): L[MAT.get(cls, 'steel')].append(lum(v.strip()))
RANGE = {k: (min(v), max(v)) for k, v in L.items()}

def mixed(mt, c):
    a, b = RANGE[mt]
    t = 0.5 if b <= a else (lum(c) - a) / (b - a)
    return 'color-mix(in srgb, var(--g-%s-hi) %s%%, var(--g-%s-lo))' % (mt, round(max(0, min(1, t))*100, 1), mt)

out, cur = [], None
for t in tok:
    if t[:15] in ('<linearGradient', '<radialGradient'):
        m = re.search(r'id="([^"]+)"', t); cur = gmat.get(m.group(1)) if m else None
    elif t.startswith('<stop') and cur:
        t = re.sub(r'stop-color="(#[0-9a-fA-F]{3,6})"',
                   lambda s: 'stop-color="%s"' % mixed(cur, s.group(1)), t)
    out.append(t)
defs = ''.join(out)

body = src[src.index('</defs>')+7 : src.rindex('</svg>')]
body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
body = re.sub(r'<polygon class="st63"[^/]*/>', '', body)
def swap(m):
    cls = m.group(1)
    if cls == 'st0': return 'class="g-none" style="fill:none"'
    mt = MAT.get(cls, 'steel')
    extra = ' g-crank' if cls in CRANK else ''
    v = decl.get(cls, '').strip()
    paint = v if v.startswith('url(') else mixed(mt, v)
    return 'class="g-%s%s" style="fill:%s"' % (mt, extra, paint)
body = re.sub(r'class="(st\d+)"', swap, body)
body = body.replace('<ellipse cx=', '<ellipse class="g-ink g-crank" style="fill:var(--g-ink-lo)" cx=', 1)

# the crank, in three pieces so it can turn
els = re.findall(r'<(?:path|polygon|ellipse)\b[^>]*class="[^"]*g-crank[^"]*"[^>]*/>', body)
assert len(els) == 6, len(els)
for e in els: body = body.replace(e, '', 1)
arm   = [e for e in els if '3039.57 3001.61' in e]
throw = [e for e in els if '3211.71 3428.6 3182.79 3457.53' in e]
grip  = [e for e in els if e not in arm and e not in throw]
assert len(arm) == 1 and len(throw) == 1 and len(grip) == 4
crank = ('\n    <!-- The crank, in three pieces because it has to turn: the arm along\n'
         '         the axle, which does not move; the throw, which is the whole of\n'
         '         the turn seen edge-on and so is scaled about the axle rather\n'
         '         than rotated; and the handle, which rides the end of it. -->\n'
         '    <g class="g-crank-arm">' + arm[0] + '</g>\n'
         '    <g class="g-crank-throw">' + throw[0] + '</g>\n'
         '    <g class="g-crank-grip">' + ''.join(grip) + '</g>')

svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
       ' viewBox="0 0 3499.57 3989.09" aria-hidden="true" focusable="false">\n'
       '  <defs>' + defs.strip() + '</defs>\n'
       '  <g class="g-hue">' + crank + body.rstrip() + '\n  </g>\n</svg>\n')
io.open(os.path.join(HERE, 'gramophone.svg'), 'w', encoding='utf-8').write(svg)
print('bytes', len(svg), '| stops', svg.count('color-mix'), '| ranges', {k:(round(a,3),round(b,3)) for k,(a,b) in RANGE.items()})
