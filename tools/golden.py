import math
PHI=(1+5**.5)/2
def golden(W=PHI, H=1.0, n=11):
    sq=[]; x,y,w,h=0,0,W,H
    for k in range(n):
        d=k%4
        if d==0: s=h; sq.append((x,y,s)); x,w=x+s,w-s
        elif d==1: s=w; sq.append((x,y,s)); y,h=y+s,h-s
        elif d==2: s=h; sq.append((x+w-s,y,s)); w=w-s
        else: s=w; sq.append((x,y+h-s,s)); h=h-s
    eye=(x+w/2,y+h/2)
    cur=(0,H); arcs=[]; lines=[]
    for (sx,sy,s) in sq:
        C=[(sx,sy),(sx+s,sy),(sx+s,sy+s),(sx,sy+s)]
        ci=min(range(4),key=lambda i:math.dist(C[i],cur)); cur=C[ci]
        end=C[(ci+2)%4]
        cands=[C[(ci+1)%4],C[(ci+3)%4]]
        cen=min(cands,key=lambda c:math.dist(c,eye))
        # sweep: choose flag via cross product
        cr=(cur[0]-cen[0])*(end[1]-cen[1])-(cur[1]-cen[1])*(end[0]-cen[0])
        arcs.append(f"A{s:.4f},{s:.4f} 0 0 {1 if cr>0 else 0} {end[0]:.4f},{end[1]:.4f}")
        lines.append((sx,sy,s)); cur=end
    return "M0,%.4f "%H+" ".join(arcs), lines
if __name__=="__main__":
  p,ls=golden()
  def svg(withsq, frame, size=300):
    k=size/PHI; sw=2.2/k
    g=f'<path d="{p}" fill="none" stroke="#3a3330" stroke-width="{sw*1.2}" stroke-linecap="round"/>'
    if withsq: g+="".join(f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="none" stroke="#3a3330" stroke-width="{sw*0.7}" opacity=".55"/>' for x,y,s in ls[:9])
    if frame: g+=f'<rect x="0" y="0" width="{PHI}" height="1" rx="0.09" fill="none" stroke="#3a3330" stroke-width="{sw*2.4}"/>'
    return f'<svg viewBox="-0.05 -0.05 {PHI+0.1} 1.1" width="{size}">{g}</svg>'
  html="<body style='margin:0;background:#fff;font:14px sans-serif;display:flex;gap:20px;padding:20px'>"+"".join(f"<div>{svg(a,b)}<div>{n}</div></div>" for n,a,b in [("らせんだけ",0,0),("部屋（正方形）つき",1,0),("カードの枠＋部屋",1,1)])+"</body>"
  open("gr.html","w").write(html)
