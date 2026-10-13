/**
 * GLSL for the living logos. Each logo is one full-screen fragment pass:
 * layered SDF "pillows" (2.5D inflated shapes), analytic glossy eyes, glyph
 * expressions and glow. Output is premultiplied sRGB.
 */
import type { LivingLogoApp } from './shapes';

/**
 * One full-screen triangle with no vertex buffer: corners (-1,-1), (3,-1), (-1,3)
 * derived from gl_VertexID. vUv runs 0..1 across the viewport, y up.
 */
export const VERTEX_SHADER = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2))*2.0 - 1.0;
  vUv = p*0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const COMMON = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSdf;
uniform sampler2D uText;
uniform vec2 uRes;
uniform float uZoom;
uniform float uTime;
uniform vec2 uTilt;
uniform vec4 uXf;      // (anchorX, anchorY, scaleX, scaleY) squash & stretch around anchor
uniform vec2 uShift;   // whole-logo offset (frame units)
uniform float uBg;     // 0 transparent, 1 black, 2 studio
uniform float uTexel;
uniform vec4 uEye[24]; // 2 eyes x 12 vec4
uniform vec4 uMisc[8];
#define PI 3.14159265

vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
vec3 hexc(float r, float g, float b){ return lin(vec3(r, g, b)/255.0); }
float cov(float d, float px){ return clamp(0.5 - d/px, 0.0, 1.0); }
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }

vec4 SD(vec2 p){
  vec2 q = clamp(p, vec2(0.0015), vec2(0.9985));
  return texture2D(uSdf, q) + length(p - q);
}
// value + gradient of one SDF channel
vec3 layerDG(vec2 p, vec4 m){
  float e = uTexel*1.25;
  float d = dot(SD(p), m);
  float dx = dot(SD(p + vec2(e, 0.0)) - SD(p - vec2(e, 0.0)), m);
  float dy = dot(SD(p + vec2(0.0, e)) - SD(p - vec2(0.0, e)), m);
  return vec3(d, vec2(dx, dy)/(2.0*e));
}
float layerD(vec2 p, vec4 m){ return dot(SD(p), m); }

// inflated "pillow" normal: circular bevel of radius R plus a broad dome of radius R2 (weight k2)
vec3 pillowN(float depth, vec2 g, float R, float R2, float k2){
  float x = clamp(depth/R, 0.0, 1.0);
  float s = (1.0 - x)/sqrt(max(1.0 - (1.0 - x)*(1.0 - x), 0.0016));
  float x2 = clamp(depth/R2, 0.0, 1.0);
  float s2 = (1.0 - x2)/sqrt(max(1.0 - (1.0 - x2)*(1.0 - x2), 0.01));
  vec2 gn = g/max(length(g), 1e-5);
  return normalize(vec3(gn*(min(s, 9.0) + min(s2, 3.0)*k2), 1.0));
}

// procedural photo-studio environment (linear radiance) seen in reflections
vec3 studioEnv(vec3 r){
  float top   = smoothstep(0.22, 0.62, r.y)*(0.75 + 0.25*smoothstep(0.4, -0.4, r.x));
  float left  = smoothstep(0.50, 0.86, -r.x)*smoothstep(-0.55, 0.25, r.y)*0.55;
  float right = smoothstep(0.62, 0.95, r.x)*smoothstep(-0.35, 0.35, r.y)*0.30;
  float flr   = smoothstep(0.30, 0.90, -r.y)*0.10;
  float front = smoothstep(0.90, 1.0, r.z)*0.10;
  return vec3(top + left + right + flr + front);
}

struct Mat {
  vec3 core; vec3 edge; float coreD;
  float R; float R2; float k2;
  float amb; float dif;
  float spec; float shin; float env;
  float rim; vec3 rimC;
  float sss; vec3 sssC;
  float envBase;
};
const vec3 LKEY = vec3(-0.42, 0.62, 0.66);

vec3 shadeMat(Mat M, vec3 base, float depth, vec3 n){
  vec3 L = normalize(LKEY); vec3 V = vec3(0.0, 0.0, 1.0);
  float wrap = clamp((dot(n, L) + 0.55)/1.55, 0.0, 1.0);
  // grazing key for gloss so flat faces stay clean: highlights live on the bevels only
  vec3 Lg = normalize(vec3(-0.50, 0.76, 0.42));
  float sp = pow(max(dot(n, normalize(Lg + V)), 0.0), M.shin)*M.spec;
  vec3 r = reflect(-V, n);
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  vec3 c = base*(M.amb + M.dif*wrap);
  if (M.sss > 0.0) c += M.sssC*exp(-depth/M.sss);
  c += mix(vec3(1.0), M.rimC, 0.35)*sp + studioEnv(r)*M.env*(M.envBase + (1.0 - M.envBase)*fres);
  c += M.rimC*fres*M.rim;
  return c;
}
vec3 mixS(vec3 a, vec3 b, float t){ return lin(mix(srgb(a), srgb(b), t)); }
float upWarp = 0.0; // >0: upper bevels read thinner (light enters from above)
vec3 shadeLayer(Mat M, vec3 DG, out vec3 n, out float depth){
  depth = max(-DG.x, 0.0);
  n = pillowN(depth, DG.yz, M.R, M.R2, M.k2);
  float dd = depth*(1.0 - upWarp*0.5*smoothstep(0.0, 0.7, n.y) + upWarp*0.8*smoothstep(0.0, 0.6, -n.y));
  vec3 base = mixS(M.edge, M.core, smoothstep(0.0, M.coreD, dd));
  return shadeMat(M, base, depth, n);
}
void over(inout vec4 acc, vec3 c, float a){ acc = vec4(c*a, a) + acc*(1.0 - a); }
void addGlow(inout vec4 acc, vec3 c, float amt){
  acc.rgb += c*amt;
  acc.a = clamp(acc.a + amt*max(max(c.r, c.g), c.b), 0.0, 1.0);
}

// ---------------------------------------------------------------- eye glyphs (eye-radius units, y up)
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*h); }
float sdRBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdEll(vec2 p, vec2 ab){ float k0 = length(p/ab); float k1 = length(p/(ab*ab)); return k0*(k0 - 1.0)/max(k1, 1e-4); }
float sdArcS(vec2 p, float ra, float ha, float w){
  vec2 sc = vec2(sin(ha), cos(ha)); p.x = abs(p.x);
  return ((sc.y*p.x > sc.x*p.y) ? length(p - sc*ra) : abs(length(p) - ra)) - w;
}
float sdLens(vec2 p, float a, float t){
  vec2 q = abs(vec2(p.y, p.x));
  float r = 0.5*(a*a/t + t); float d = r - t;
  return ((q.y - a)*d > q.x*a) ? length(q - vec2(0.0, a)) : length(q - vec2(-d, 0.0)) - r;
}
// 0 ORB(sx,sy) 1 RBOX(hx,hy,c) 2 ARC(ra,halfAngle,w,dir) 3 CROSS(L,w) 4 CHEVRON(s,halfAngle,w,dir) 5 DOT(r) 6 LENS(a,tTop,tBot,angle)
float glyph(float type, vec2 q, vec4 P){
  if (type < 0.5) return sdEll(q, P.xy);
  if (type < 1.5) return sdRBox(q, P.xy, P.z);
  if (type < 2.5) { vec2 qq = vec2(q.x, q.y*P.w); qq.y += P.x*(1.0 + cos(P.y))*0.5; return sdArcS(qq, P.x, P.y, P.z); }
  if (type < 3.5) { float L = P.x*0.7071; return min(sdSeg(q, vec2(-L, -L), vec2(L, L)), sdSeg(q, vec2(-L, L), vec2(L, -L))) - P.y; }
  if (type < 4.5) { vec2 qq = vec2(q.x*P.w, q.y); vec2 tip = vec2(P.x*0.42, 0.0); vec2 a = vec2(-P.x*0.42, P.x*tan(P.y)*0.84);
                    return min(sdSeg(qq, a, tip), sdSeg(qq, vec2(a.x, -a.y), tip)) - P.z; }
  if (type < 5.5) return length(q) - P.x;
  vec2 qq = rot(q, -P.w);
  return sdLens(qq, P.x, qq.y > 0.0 ? P.y : P.z);
}
float glyphR(float type, vec4 P){
  if (type < 0.5) return min(P.x, P.y);
  if (type < 1.5) return min(min(P.x, P.y), 0.42);
  if (type < 2.5) return P.z;
  if (type < 3.5) return P.y;
  if (type < 4.5) return P.z;
  if (type < 5.5) return P.x;
  return max(min(P.y, P.z), 0.05)*1.15;
}
// eye state helpers
struct Eye { vec2 c; float r; float side; float tA; float tB; float t; vec4 PA; vec4 PB; vec4 LD; vec4 XF; vec4 GZ; vec4 BR; vec4 HL; vec4 HS; vec2 ROT; vec4 BS; };
Eye getEye(int i){
  Eye e; int b = i*12;
  e.c = uEye[b].xy; e.r = uEye[b].z; e.side = uEye[b].w;
  e.tA = uEye[b+1].x; e.tB = uEye[b+1].y; e.t = uEye[b+1].z;
  e.PA = uEye[b+2]; e.PB = uEye[b+3]; e.LD = uEye[b+4]; e.XF = uEye[b+5];
  e.GZ = uEye[b+6]; e.BR = uEye[b+7]; e.HL = uEye[b+8]; e.HS = uEye[b+9]; e.ROT = uEye[b+10].xy; e.BS = uEye[b+11];
  return e;
}
// glyph SDF of eye (no lids), eye units
float eyeSD(Eye e, vec2 q){ return mix(glyph(e.tA, rot(q, -e.ROT.x), e.PA), glyph(e.tB, rot(q, -e.ROT.y), e.PB), e.t); }
float eyeLid(Eye e, vec2 q, out float sdTop){
  vec2 qt = rot(q, -e.LD.z*e.side);
  float yT = 1.10 - 2.2*e.LD.x;
  sdTop = qt.y - (yT - 0.20*(1.0 - e.LD.x)*qt.x*qt.x);
  vec2 qb = rot(q, -e.LD.w*e.side);
  float yB = -1.10 + 2.2*e.LD.y;
  float sdBot = (yB + 0.14*(1.0 - e.LD.y)*qb.x*qb.x) - qb.y;
  return max(sdTop, sdBot);
}
// brow / lid stroke (eye units, unaffected by blink squash): BR = (alpha, dy, angle, kind), BS = (size, half-width, dx outward)
float browSD(Eye e, vec2 q0){
  vec2 q = rot(q0 - vec2(e.XF.x + e.BS.z*e.side, e.BR.y), -e.BR.z*e.side);
  float L = e.BS.x, w = e.BS.y;
  if (e.BR.w < 0.5) return sdSeg(q, vec2(-L, 0.0), vec2(L, 0.0)) - w;
  if (e.BR.w < 1.5) { float ha = 1.0; float ra = L/sin(ha); return sdArcS(q + vec2(0.0, ra), ra, ha, w); }   // arch, apex at dy
  float ha = 0.75; float ra = L/sin(ha); return sdArcS(vec2(q.x, -q.y) + vec2(0.0, ra), ra, ha, w);            // bowl, lowest point at dy
}
float orbness(Eye e){ return (e.tA < 0.5 ? 1.0 - e.t : 0.0) + (e.tB < 0.5 ? e.t : 0.0); }
// sphere-reflection catchlight placed so that it appears at local position h (|h|<1)
float catchlight(vec3 n, vec2 h, float size){
  vec3 nh = vec3(h, sqrt(max(1.0 - dot(h, h), 0.0)));
  vec3 L = 2.0*nh.z*nh - vec3(0.0, 0.0, 1.0);
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float c = dot(r, L);
  return smoothstep(cos(size), cos(size*0.55), c);
}
`;

// Shared eye renderer; style constants per app via #defines
const EYES = /* glsl */`
// returns premultiplied linear colour of eye i; parentLift lets lids use the parent material
vec4 renderEye(int i, vec2 p, float px, vec3 lidColor){
  Eye e = getEye(i);
  if (e.r <= 0.0) return vec4(0.0);
  vec2 q0 = (p - e.c)/e.r;
  if (dot(q0, q0) > 7.0) return vec4(0.0);
  vec2 q = (q0 - e.XF.xy)/e.XF.zw;
  float sc = e.r*min(e.XF.z, e.XF.w);
  float sd = eyeSD(e, q);
  float sdTop; float lid = eyeLid(e, q, sdTop);
  float sdv = max(sd, lid);
  vec4 acc = vec4(0.0);
  float a = cov(sdv*sc, px);
  if (a > 0.0) {
    float ee = 0.006;
    vec2 g = vec2(eyeSD(e, q + vec2(ee, 0.0)) - eyeSD(e, q - vec2(ee, 0.0)), eyeSD(e, q + vec2(0.0, ee)) - eyeSD(e, q - vec2(0.0, ee)))/(2.0*ee);
    float Rd = mix(glyphR(e.tA, e.PA), glyphR(e.tB, e.PB), e.t);
    float depth = max(-sd, 0.0);
    float x = clamp(depth/Rd, 0.0, 1.0);
    float s = (1.0 - x)/sqrt(max(1.0 - (1.0 - x)*(1.0 - x), 0.0009));
    vec3 n = normalize(vec3(g/max(length(g), 1e-5)*min(s, 14.0), 1.0));
    float wo = orbness(e);
    vec3 col = EYE_SHADE(e, q, n, depth/Rd, wo);
    // soft shadow cast by the upper lid onto the eye
    col *= mix(1.0, 0.35, exp(-max(-sdTop, 0.0)/0.10)*step(0.02, e.LD.x));
    acc = vec4(col*a, a);
  }
  // brows / creases
  if (e.BR.x > 0.001) {
    float sb = browSD(e, q0);
    float ab = cov(sb*e.r, px)*e.BR.x;
    if (ab > 0.0) {
      float ee = 0.006;
      vec2 g = vec2(browSD(e, q0 + vec2(ee, 0.0)) - browSD(e, q0 - vec2(ee, 0.0)), browSD(e, q0 + vec2(0.0, ee)) - browSD(e, q0 - vec2(0.0, ee)))/(2.0*ee);
      float depth = max(-sb, 0.0); float x = clamp(depth/max(e.BS.y, 0.01), 0.0, 1.0);
      float s = (1.0 - x)/sqrt(max(1.0 - (1.0 - x)*(1.0 - x), 0.0009));
      vec3 n = normalize(vec3(g/max(length(g), 1e-5)*min(s, 14.0), 1.0));
      vec3 col = EYE_SHADE(e, vec2(9.0), n, x, 0.0);
      over(acc, col, ab);
    }
  }
  return acc;
}
// Baymax-style connecting line between the eyes
vec4 renderEyeLine(vec2 p, float px){
  if (uMisc[0].x <= 0.001) return vec4(0.0);
  Eye e0 = getEye(0); Eye e1 = getEye(1);
  vec2 a = e0.c + e0.XF.xy*e0.r, b = e1.c + e1.XF.xy*e1.r;
  float w = uMisc[0].y;
  float d = sdSeg(p, a, b) - w;
  float al = cov(d, px)*uMisc[0].x;
  if (al <= 0.0) return vec4(0.0);
  float depth = max(-d, 0.0)/w;
  vec2 dir = normalize(b - a); vec2 nn = vec2(-dir.y, dir.x);
  float side = dot(p - a, nn)/w;
  vec3 n = normalize(vec3(nn*side, sqrt(max(1.0 - side*side, 0.02))));
  vec3 col = EYE_SHADE(e0, vec2(9.0), n, depth, 0.0);
  return vec4(col*al, al);
}
`;

// ------------------------------------------------------------------ per-app compositions
const MAIL = /* glsl */`
#define DS (1.0/1384.0)
vec3 EYE_SHADE(Eye e, vec2 q, vec3 n, float core, float wo){
  vec3 V = vec3(0.0, 0.0, 1.0);
  float rq = length(q);
  // dark amber glass: black pupil, deep orange-brown body, near-black rim
  vec3 glass = mix(hexc(4.0, 0.5, 0.0), hexc(96.0, 15.0, 1.0), smoothstep(0.30, 0.82, rq)*wo);
  glass = mix(glass, hexc(22.0, 3.0, 1.0), smoothstep(0.90, 0.99, rq)*wo);
  vec3 col = glass*(1.0 - 0.6*(1.0 - wo));
  if (wo > 0.001 && rq < 1.0) {
    vec3 m = vec3(q, sqrt(max(1.0 - rq*rq, 0.0)));
    float yaw = e.GZ.x*0.42, pitch = e.GZ.y*0.36;
    m.xz = rot(m.xz, -yaw); m.yz = rot(m.yz, pitch);
    vec2 u = m.xy; float front = smoothstep(-0.05, 0.3, m.z);
    float rr = length(u - vec2(0.0, -0.04));
    float lower = smoothstep(0.10, -0.16, u.y + 0.02*e.side*u.x);
    float ring  = exp(-pow((rr - 0.56)/0.095, 2.0))*lower;
    float coreL = exp(-pow((rr - 0.56)/0.026, 2.0))*lower;
    float halo  = exp(-abs(rr - 0.56)/0.20)*lower;
    float ang = atan(u.y, u.x*e.side);
    float dashM = smoothstep(0.40, 0.26, abs(ang));
    float d1 = exp(-pow((rr - 0.815)/0.022, 2.0)), d2 = exp(-pow((rr - 0.905)/0.020, 2.0));
    float dashes = (d1 + d2)*dashM;
    float dcore = (exp(-pow((rr - 0.815)/0.008, 2.0)) + exp(-pow((rr - 0.905)/0.008, 2.0)))*dashM;
    float pulse = 0.93 + 0.07*sin(uTime*2.3 + e.side);
    vec3 emit = hexc(255.0, 120.0, 4.0)*ring*2.2 + hexc(255.0, 236.0, 70.0)*coreL*1.8 + hexc(200.0, 50.0, 0.0)*halo*0.9
              + hexc(255.0, 140.0, 10.0)*dashes*1.8 + hexc(255.0, 245.0, 210.0)*dcore*1.1;
    col += emit*front*e.GZ.w*pulse*wo;
  }
  // expression glyphs: dark glossy tube with an orange neon core
  float gw = 1.0 - wo;
  col += hexc(255.0, 110.0, 6.0)*smoothstep(0.25, 0.9, core)*gw*1.25*e.GZ.w;
  col += hexc(255.0, 230.0, 120.0)*smoothstep(0.78, 1.0, core)*gw*0.9*e.GZ.w;
  vec3 r = reflect(-V, n);
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  col += studioEnv(r)*fres*0.12*hexc(255.0, 200.0, 160.0);
  float h1 = catchlight(n, e.HL.xy, e.HS.x), h2 = catchlight(n, e.HL.zw, e.HS.y);
  col += vec3(h1*e.HS.z + h2*e.HS.w)*1.25;
  return col;
}
${EYES}
float glowAt(float d){ float g = max(d, 0.0); return 0.075*exp(-g/(3.0*DS)) + 0.030*exp(-g/(11.0*DS)) + 0.005*exp(-g/(45.0*DS)); }
void compose(vec2 p, float px, inout vec4 acc){
  vec2 pe = p - uTilt*0.004, pf = p + uTilt*0.006, pp = p + uTilt*0.009, pi = p + uTilt*0.016;
  vec3 E = layerDG(pe, vec4(1, 0, 0, 0));
  vec3 F = layerDG(pf, vec4(0, 1, 0, 0));
  vec3 P = layerDG(pp, vec4(0, 0, 1, 0));
  float dAll = min(E.x, F.x);
  // halo: orange around the jelly band, faint cool light around the white front
  float bandness = smoothstep(-10.0*DS, 30.0*DS, F.x);
  vec3 gc = mix(hexc(170.0, 190.0, 230.0)*0.35, hexc(255.0, 120.0, 20.0), bandness);
  addGlow(acc, gc, glowAt(dAll)*uMisc[1].x*step(0.0, dAll));
  // ---- orange jelly envelope (back)
  if (E.x < 2.0*px) {
    Mat M;
    M.core = hexc(246.0, 92.0, 8.0); M.edge = hexc(255.0, 232.0, 110.0); M.coreD = 84.0*DS;
    M.R = 46.0*DS; M.R2 = 1.0; M.k2 = 0.0;
    M.amb = 0.90; M.dif = 0.14; M.spec = 0.85; M.shin = 46.0; M.env = 1.0; M.envBase = 0.0;
    upWarp = 1.0;
    M.rim = 0.45; M.rimC = hexc(255.0, 238.0, 160.0);
    M.sss = 9.0*DS; M.sssC = hexc(255.0, 220.0, 100.0)*0.35;
    vec3 n; float depth;
    vec3 c = shadeLayer(M, E, n, depth);
    // hot rim where the band tucks under the white front
    float tk = max(F.x, 0.0);
    float tuck = (0.75*exp(-tk/(7.0*DS)) + 0.50*exp(-tk/(30.0*DS)))*smoothstep(-1.0*DS, 3.0*DS, F.x);
    c = mix(c, hexc(255.0, 228.0, 140.0), clamp(tuck, 0.0, 1.0));
    // light enters through the top of the jelly: pale upper bevel, brightest on the rounded corners
    c = mixS(c, hexc(255.0, 246.0, 172.0), smoothstep(0.30, 0.85, n.y)*(1.0 - smoothstep(10.0*DS, 46.0*DS, depth))*0.75);
    // the rounded ends of the band are thinner, so they glow yellow (top-left lobe, top-right and bottom-right corners)
    vec2 rp = vec2(76.0 + pe.x*1384.0, -191.0 + (1.0 - pe.y)*1384.0);
    float ends = 0.85*exp(-length(rp - vec2(235.0, 235.0))/190.0) + 0.95*exp(-length(rp - vec2(1255.0, 215.0))/150.0) + 0.6*exp(-length(rp - vec2(1255.0, 835.0))/120.0);
    c = mixS(c, hexc(255.0, 232.0, 118.0), clamp(ends, 0.0, 0.9));
    upWarp = 0.0;
    over(acc, c, cov(E.x, px));
  }
  // ---- white flap (outer frame of the envelope front)
  if (F.x < 2.0*px) {
    Mat M;
    M.core = hexc(238.0, 231.0, 232.0); M.edge = hexc(244.0, 238.0, 238.0); M.coreD = 30.0*DS;
    M.R = 22.0*DS; M.R2 = 1.0; M.k2 = 0.0;
    M.amb = 0.86; M.dif = 0.18; M.spec = 0.22; M.shin = 40.0; M.env = 0.6; M.envBase = 0.08;
    M.rim = 0.25; M.rimC = hexc(240.0, 246.0, 255.0);
    M.sss = 0.0; M.sssC = vec3(0.0);
    vec3 n; float depth;
    vec3 c = shadeLayer(M, F, n, depth);
    float nearBand = exp(-depth/(22.0*DS))*smoothstep(12.0*DS, 40.0*DS, -E.x);
    c = mix(c, hexc(255.0, 247.0, 222.0), nearBand*0.8);
    c = mix(c, hexc(226.0, 236.0, 250.0), smoothstep(0.1, -0.7, n.y)*0.6); // cool bounce on lower bevel
    over(acc, c, cov(F.x, px));
  }
  // ---- inner panel with glowing eye sockets
  if (P.x < 2.0*px) {
    Mat M;
    M.core = hexc(212.0, 211.0, 218.0); M.edge = hexc(226.0, 220.0, 222.0); M.coreD = 70.0*DS;
    M.R = 20.0*DS; M.R2 = 1.0; M.k2 = 0.0;
    M.amb = 0.86; M.dif = 0.20; M.spec = 0.20; M.shin = 36.0; M.env = 0.6; M.envBase = 0.06;
    M.rim = 0.25; M.rimC = vec3(1.0);
    M.sss = 0.0; M.sssC = vec3(0.0);
    vec3 n; float depth;
    vec3 c = shadeLayer(M, P, n, depth);
    // warm light spilling from the band onto the top / right of the panel
    float nearBand = exp(-max(-F.x, 0.0)/(46.0*DS))*smoothstep(10.0*DS, 46.0*DS, -E.x);
    c = mix(c, hexc(250.0, 222.0, 205.0), nearBand*0.75);
    c = mix(c, hexc(255.0, 250.0, 232.0), exp(-max(-F.x, 0.0)/(7.0*DS))*smoothstep(10.0*DS, 46.0*DS, -E.x)*0.8);
    // cool rim light on the bottom bevel
    c = mix(c, hexc(232.0, 242.0, 252.0), exp(-depth/(10.0*DS))*smoothstep(0.1, -0.6, n.y)*0.85);
    // sockets: the eyes light up the panel around them
    for (int i = 0; i < 2; i++) {
      Eye e = getEye(i);
      vec2 ec = e.c + e.XF.xy*e.r;
      float dd = (length(pi - ec) - e.r*min(e.XF.z, e.XF.w))/e.r;
      float wo = orbness(e);
      float halo = exp(-max(dd, 0.0)/0.20)*step(-0.03, dd);
      c = mix(c, hexc(254.0, 246.0, 230.0), halo*0.92*wo);
      c = mix(c, hexc(255.0, 255.0, 252.0), exp(-max(dd, 0.0)/0.05)*step(-0.03, dd)*0.9*wo);
    }
    over(acc, c, cov(P.x, px));
  }
  // ---- eyes
  vec4 L = renderEyeLine(pi, px); acc = L + acc*(1.0 - L.a);
  for (int i = 0; i < 2; i++) { vec4 ec = renderEye(i, pi, px, vec3(1.0)); acc = ec + acc*(1.0 - ec.a); }
}
`;

const MAIN = /* glsl */`
void main(){
  vec2 frag = vUv*uRes;
  float m = min(uRes.x, uRes.y);
  vec2 p = (frag - 0.5*uRes)/(m*uZoom) + 0.5 - uShift;
  float px = 1.0/(m*uZoom);
  p = (p - uXf.xy)/uXf.zw + uXf.xy;
  px /= min(uXf.z, uXf.w);
  vec4 acc = vec4(0.0);
  compose(p, px, acc);
  vec3 bg = vec3(0.0);
  if (uBg > 1.5) { vec2 d = vUv - vec2(0.5, 0.42); bg = lin(vec3(0.07, 0.075, 0.09))*(1.0 - 0.8*dot(d, d)*2.0); }
  vec4 outc = acc;
  if (uBg > 0.5) { outc.rgb = acc.rgb + bg*(1.0 - acc.a); outc.a = 1.0; }
  // tone + encode (premultiplied)
  vec3 c = outc.a > 0.0 ? outc.rgb/outc.a : vec3(0.0);
  c = c/(1.0 + max(c - 1.0, 0.0)*0.6); // soft shoulder for highlights
  float dither = (hash(frag + fract(uTime)) - 0.5)/255.0;
  gl_FragColor = vec4((srgb(c) + dither)*outc.a, outc.a);
}
`;

const hx = (r: number, g: number, b: number): string => `hexc(${r.toFixed(1)}, ${g.toFixed(1)}, ${b.toFixed(1)})`;
const GLOW = (k: string): string => `float glowAt(float d){ float g = max(d, 0.0); return ${k}*(0.075*exp(-g/(3.0*DS)) + 0.030*exp(-g/(11.0*DS)) + 0.005*exp(-g/(45.0*DS))); }`;
// small helper: shade a layer whose albedo is already computed (gradients / text baked into 'base')
const SHADE_BASE = /* glsl */`
vec3 shadeBase(Mat M, vec3 base, vec3 DG, out vec3 n, out float depth){
  depth = max(-DG.x, 0.0);
  n = pillowN(depth, DG.yz, M.R, M.R2, M.k2);
  return shadeMat(M, base, depth, n);
}
`;

// ------------------------------------------------------------------ QuantDrive: green jelly cloud behind a frosted glass cloud
const DRIVE = /* glsl */`
#define DS (1.0/1432.0)
vec2 RP(vec2 p){ return vec2(29.5 + p.x*1432.0, -195.0 + (1.0 - p.y)*1432.0); }
${SHADE_BASE}
vec3 EYE_SHADE(Eye e, vec2 q, vec3 n, float core, float wo){
  float rq = length(q);
  // black glass bead with a deep-green outer rim
  vec3 col = mix(${hx(1, 3, 2)}, ${hx(9, 30, 16)}, smoothstep(0.66, 0.97, rq)*wo);
  col = mix(col, ${hx(3, 10, 5)}, smoothstep(0.975, 1.0, rq)*wo);
  if (wo > 0.001 && rq < 1.0) {
    vec3 m = vec3(q, sqrt(max(1.0 - rq*rq, 0.0)));
    m.xz = rot(m.xz, -e.GZ.x*0.42); m.yz = rot(m.yz, e.GZ.y*0.36);
    vec2 u = m.xy; float front = smoothstep(-0.05, 0.3, m.z);
    float rr = length(u);
    float ang = atan(u.y, u.x);
    float dA = abs(mod(ang + 2.31 + PI, 2.0*PI) - PI);      // angular distance from the lower-left (-132 deg)
    float cres = smoothstep(1.15, 0.62, dA);
    float ringAll = exp(-pow((rr - 0.74)/0.055, 2.0));
    float coreL = exp(-pow((rr - 0.74)/0.028, 2.0))*cres;
    float glowL = exp(-pow((rr - 0.74)/0.085, 2.0))*cres;
    float pulse = 0.94 + 0.06*sin(uTime*2.1 + e.side);
    vec3 emit = ${hx(26, 74, 38)}*ringAll*0.9 + ${hx(110, 235, 115)}*glowL*1.0 + ${hx(225, 255, 210)}*coreL*1.7;
    col += emit*front*e.GZ.w*pulse*wo;
  }
  float gw = 1.0 - wo;
  col += ${hx(80, 230, 105)}*smoothstep(0.25, 0.9, core)*gw*1.1*e.GZ.w;
  col += ${hx(215, 255, 205)}*smoothstep(0.78, 1.0, core)*gw*0.8*e.GZ.w;
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  col += studioEnv(r)*fres*0.16*${hx(200, 255, 215)};
  float h1 = catchlight(n, e.HL.xy, e.HS.x), h2 = catchlight(n, e.HL.zw, e.HS.y);
  col += vec3(h1*e.HS.z)*1.15 + ${hx(170, 255, 160)}*h2*e.HS.w*1.5;
  return col;
}
${EYES}
${GLOW('1.0')}
void compose(vec2 p, float px, inout vec4 acc){
  vec2 pb = p - uTilt*0.004, pf = p + uTilt*0.008, pi = p + uTilt*0.014;
  vec3 B = layerDG(pb, vec4(1, 0, 0, 0));
  vec3 F = layerDG(pf, vec4(0, 1, 0, 0));
  float dAll = min(B.x, F.x);
  float greenness = smoothstep(-10.0*DS, 40.0*DS, F.x);
  vec3 gc = mix(${hx(200, 235, 255)}*0.30, ${hx(80, 225, 95)}, greenness);
  addGlow(acc, gc, glowAt(dAll)*uMisc[1].x*step(0.0, dAll));
  // ---- green jelly cloud (back)
  if (B.x < 2.0*px) {
    Mat M;
    M.core = ${hx(108, 224, 116)}; M.edge = ${hx(170, 249, 146)}; M.coreD = 44.0*DS;
    M.R = 40.0*DS; M.R2 = 1.0; M.k2 = 0.0;
    M.amb = 0.92; M.dif = 0.12; M.spec = 0.70; M.shin = 46.0; M.env = 0.9; M.envBase = 0.0;
    M.rim = 0.35; M.rimC = ${hx(220, 255, 200)};
    M.sss = 8.0*DS; M.sssC = ${hx(170, 255, 140)}*0.25;
    upWarp = 1.0;
    vec3 n; float depth;
    vec3 c = shadeLayer(M, B, n, depth);
    upWarp = 0.0;
    c *= mix(0.78, 1.0, smoothstep(0.0, 30.0*DS, F.x)); // contact shadow of the glass cloud
    over(acc, c, cov(B.x, px));
  }
  // ---- frosted glass cloud (front): tinted by whatever sits behind it
  if (F.x < 2.0*px) {
    vec2 r = RP(pf);
    float behind = smoothstep(40.0*DS, -90.0*DS, B.x)*(1.0 - smoothstep(860.0, 1190.0, r.x + 0.25*(r.y - 600.0)));
    float tv = clamp((r.y - 360.0)/400.0, 0.0, 1.0);
    vec3 green = mixS(${hx(122, 197, 156)}, ${hx(204, 247, 212)}, smoothstep(0.05, 0.85, tv));
    vec3 white = mixS(${hx(232, 234, 246)}, ${hx(250, 250, 253)}, smoothstep(0.0, 0.8, tv));
    vec3 base = mixS(white, green, behind);
    Mat M;
    M.core = base; M.edge = base; M.coreD = 1.0;
    M.R = 34.0*DS; M.R2 = 1.0; M.k2 = 0.0;
    M.amb = 0.93; M.dif = 0.10; M.spec = 0.30; M.shin = 34.0; M.env = 0.55; M.envBase = 0.04;
    M.rim = 0.45; M.rimC = ${hx(245, 250, 255)};
    M.sss = 0.0; M.sssC = vec3(0.0);
    vec3 n; float depth;
    vec3 c = shadeBase(M, base, F, n, depth);
    float lowBevel = smoothstep(0.15, -0.6, n.y)*(1.0 - exp(-depth/(7.0*DS)));
    c = mix(c, ${hx(200, 218, 228)}, lowBevel*0.65);
    c = mix(c, ${hx(240, 246, 250)}, exp(-depth/(5.0*DS))*0.55);
    // eyes light up the glass around them
    for (int i = 0; i < 2; i++) {
      Eye e = getEye(i);
      vec2 ec = e.c + e.XF.xy*e.r;
      float dd = (length(pi - ec) - e.r*min(e.XF.z, e.XF.w))/e.r;
      float wo = orbness(e);
      c = mix(c, ${hx(230, 252, 232)}, exp(-max(dd, 0.0)/0.16)*step(-0.03, dd)*0.55*wo);
    }
    over(acc, c, cov(F.x, px));
  }
  vec4 L = renderEyeLine(pi, px); acc = L + acc*(1.0 - L.a);
  for (int i = 0; i < 2; i++) { vec4 ec = renderEye(i, pi, px, vec3(1.0)); acc = ec + acc*(1.0 - ec.a); }
}
`;

// ------------------------------------------------------------------ QuantContacts: frosted peach person in front of an amber jelly person
const CONTACTS = /* glsl */`
#define DS (1.0/824.0)
vec2 RP(vec2 p){ return vec2(309.0 + p.x*824.0, 128.0 + (1.0 - p.y)*824.0); }
${SHADE_BASE}
vec3 EYE_SHADE(Eye e, vec2 q, vec3 n, float core, float wo){
  float rq = length(q);
  vec3 col = mix(${hx(38, 16, 6)}, ${hx(98, 44, 12)}, smoothstep(0.35, 1.0, rq)*wo);
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  col += studioEnv(r)*fres*0.30*${hx(255, 225, 195)};
  float h1 = catchlight(n, e.HL.xy, e.HS.x), h2 = catchlight(n, e.HL.zw, e.HS.y);
  col += vec3(h1*e.HS.z + h2*e.HS.w)*1.2;
  return col;
}
${EYES}
${GLOW('0.30')}
// procedural mouth (ref px, y down): uMisc[2] = (curve, width, open, tilt); curve 1 = the reference smile
float mouthSD(vec2 p){
  vec4 m = uMisc[2];
  vec2 l = p - vec2(688.0, 484.0);
  l = rot(vec2(l.x, -l.y), -m.w);
  float hh = 61.8*m.y, s = 21.0*m.x, w = 7.6;
  float dArc;
  if (abs(s) < 0.4) dArc = sdSeg(l, vec2(-hh, 0.0), vec2(hh, 0.0)) - w;
  else {
    float sg = sign(s), S = abs(s);
    vec2 pl = vec2(l.x, l.y*sg);
    float rho = (hh*hh + S*S)/(2.0*S);
    vec2 pc = pl - vec2(0.0, rho - S*0.5);
    dArc = sdArcS(vec2(pc.x, -pc.y), rho, atan(hh, rho - S), w);
  }
  float dO = abs(length(l*vec2(1.0, 0.82)) - 15.0) - w*0.85;
  return mix(dArc, dO, m.z);
}
void compose(vec2 p, float px, inout vec4 acc){
  vec2 pb = p - uTilt*0.004, pf = p + uTilt*0.008, pm = p + uTilt*0.012;
  vec3 B = layerDG(pb, vec4(1, 0, 0, 0));
  vec3 F = layerDG(pf, vec4(0, 1, 0, 0));
  float dAll = min(B.x, F.x);
  vec3 gc = mix(${hx(255, 210, 170)}*0.55, ${hx(255, 140, 20)}, smoothstep(-10.0*DS, 30.0*DS, F.x));
  addGlow(acc, gc, glowAt(dAll)*uMisc[1].x*step(0.0, dAll));
  // ---- amber jelly person (back)
  if (B.x < 2.0*px) {
    vec2 r = RP(pb);
    Mat M;
    M.core = ${hx(221, 100, 0)}; M.edge = ${hx(252, 192, 14)}; M.coreD = 40.0*DS;
    M.R = 34.0*DS; M.R2 = 1.0; M.k2 = 0.0;
    M.amb = 0.92; M.dif = 0.12; M.spec = 0.55; M.shin = 44.0; M.env = 0.8; M.envBase = 0.0;
    M.rim = 0.30; M.rimC = ${hx(255, 225, 120)};
    M.sss = 7.0*DS; M.sssC = ${hx(255, 200, 60)}*0.25;
    upWarp = 1.0;
    vec3 n; float depth;
    vec3 c = shadeLayer(M, B, n, depth);
    upWarp = 0.0;
    c = mixS(c, ${hx(250, 180, 10)}, smoothstep(0.0, 0.8, n.x*0.7 + n.y*0.7)*0.45); // lit from the upper right
    c *= mix(0.80, 1.0, smoothstep(0.0, 26.0*DS, F.x));                                // shadow of the front person
    over(acc, c, cov(B.x, px));
  }
  // ---- frosted peach person (front)
  if (F.x < 2.0*px) {
    vec2 r = RP(pf);
    vec3 base;
    if (r.y < 572.0) {
      float s = dot(r - vec2(688.0, 425.0), vec2(0.869, 0.495))/150.0 + 0.477;
      base = mixS(${hx(253, 237, 226)}, ${hx(253, 206, 144)}, smoothstep(0.0, 0.477, s));
      base = mixS(base, ${hx(250, 168, 52)}, smoothstep(0.477, 1.0, s));
    } else {
      float s = (r.x - 500.0)/350.0;
      base = mixS(${hx(254, 233, 216)}, ${hx(252, 208, 155)}, smoothstep(0.0, 0.33, s));
      base = mixS(base, ${hx(247, 168, 72)}, smoothstep(0.33, 0.6, s));
      base = mixS(base, ${hx(236, 121, 16)}, smoothstep(0.6, 0.98, s));
      base = mixS(base, ${hx(254, 242, 228)}, smoothstep(640.0, 592.0, r.y)*0.35);
    }
    Mat M;
    M.core = base; M.edge = base; M.coreD = 1.0;
    M.R = 26.0*DS; M.R2 = 1.0; M.k2 = 0.0;
    M.amb = 0.94; M.dif = 0.08; M.spec = 0.28; M.shin = 40.0; M.env = 0.55; M.envBase = 0.03;
    M.rim = 0.45; M.rimC = ${hx(255, 250, 244)};
    M.sss = 0.0; M.sssC = vec3(0.0);
    vec3 n; float depth;
    vec3 c = shadeBase(M, base, F, n, depth);
    c = mix(c, ${hx(255, 253, 250)}, exp(-depth/(4.0*DS))*smoothstep(-0.2, 0.6, -n.x + n.y)*0.7); // glass edge highlight
    // soft light from the smile
    float dm = mouthSD(RP(pm))*DS;
    c = mix(c, ${hx(255, 248, 238)}, exp(-max(dm, 0.0)/(9.0*DS))*0.22);
    over(acc, c, cov(F.x, px));
  }
  // ---- smile
  {
    vec2 r = RP(pm);
    float d = mouthSD(r)*DS;
    float a = cov(d, px)*step(F.x, 0.0);
    if (a > 0.0) {
      float e = 1.0;
      vec2 g = vec2(mouthSD(r + vec2(e, 0.0)) - mouthSD(r - vec2(e, 0.0)), -(mouthSD(r + vec2(0.0, e)) - mouthSD(r - vec2(0.0, e))))/(2.0*e);
      float x = clamp(max(-d, 0.0)/(7.6*DS), 0.0, 1.0);
      float s = (1.0 - x)/sqrt(max(1.0 - (1.0 - x)*(1.0 - x), 0.01));
      vec3 n = normalize(vec3(g/max(length(g), 1e-5)*min(s, 4.0)*0.35, 1.0));
      vec3 c = mix(${hx(232, 232, 238)}, ${hx(255, 255, 255)}, smoothstep(-0.5, 0.6, n.y));
      over(acc, c, a);
    }
  }
  vec2 pi = p + uTilt*0.012;
  vec4 L = renderEyeLine(pi, px); acc = L + acc*(1.0 - L.a);
  for (int i = 0; i < 2; i++) { vec4 ec = renderEye(i, pi, px, vec3(1.0)); acc = ec + acc*(1.0 - ec.a); }
}
`;

// ------------------------------------------------------------------ QuantGit: flat white hex + purple cat (kept flat, like the brand mark)
const GIT = /* glsl */`
#define DS (1.0/1079.0)
float gPx = 0.001;
vec3 EYE_SHADE(Eye e, vec2 q, vec3 n, float core, float wo){
  vec3 col = vec3(1.0);
  float ln = (e.tA > 5.5 ? 1.0 - e.t : 0.0) + (e.tB > 5.5 ? e.t : 0.0);
  if (e.GZ.z > 0.001 && ln > 0.001) {
    vec2 c = vec2(e.GZ.x*0.30, e.GZ.y*0.12);
    float d = sdEll(q - c, vec2(0.03 + e.GZ.w*0.9, 0.58));
    col = mix(col, ${hx(90, 0, 210)}, cov(d*e.r, gPx)*e.GZ.z*ln);
  }
  return col;
}
${EYES}
void compose(vec2 p, float px, inout vec4 acc){
  gPx = px;
  float H = layerD(p, vec4(1, 0, 0, 0));
  float C = layerD(p, vec4(0, 1, 0, 0));
  if (H < 2.0*px) over(acc, mix(vec3(1.0), ${hx(90, 0, 210)}, cov(C, px)), cov(H, px));
  vec2 pi = p + uTilt*0.003;
  vec4 L = renderEyeLine(pi, px); acc = L + acc*(1.0 - L.a);
  for (int i = 0; i < 2; i++) { vec4 ec = renderEye(i, pi, px, vec3(1.0)); acc = ec + acc*(1.0 - ec.a); }
}
`;

// ------------------------------------------------------------------ QuantCalendar: blue header, frosted card, live date, binder-ring eyes
const CALENDAR = /* glsl */`
#define DS (1.0/895.0)
vec2 RP(vec2 p){ return vec2(178.0 + p.x*895.0, 170.5 + (1.0 - p.y)*895.0); }
${SHADE_BASE}
vec3 EYE_SHADE(Eye e, vec2 q, vec3 n, float core, float wo){
  // glossy white ring / glyph
  vec3 col = mixS(${hx(255, 254, 254)}, ${hx(238, 240, 248)}, smoothstep(0.85, -0.7, q.y));
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.0);
  col = mix(col, ${hx(205, 212, 232)}, fres*0.55*smoothstep(0.3, -0.7, n.x*0.6 + n.y*0.8));
  col = mix(col, vec3(1.0), fres*0.6*smoothstep(0.2, 0.9, n.y*0.8 - n.x*0.4));
  float h1 = catchlight(n, e.HL.xy, e.HS.x), h2 = catchlight(n, e.HL.zw, e.HS.y);
  col += vec3(h1*e.HS.z + h2*e.HS.w)*0.35;
  return col;
}
${EYES}
${GLOW('0.55')}
// date text: R = weekday mask, G = day mask (card-local texture); uMisc[3].x = page-flip phase
vec2 textMask(vec2 r){
  float ph = uMisc[3].x;
  float k = max(abs(cos(PI*ph)), 0.02);
  vec2 rr = vec2(r.x, 715.0 + (r.y - 715.0)/k);
  vec2 uv = vec2((rr.x - 375.5)/500.5, 1.0 - (rr.y - 500.0)/425.0);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec2(0.0);
  return texture2D(uText, uv).rg;
}
void compose(vec2 p, float px, inout vec4 acc){
  vec2 ph = p - uTilt*0.004, pc = p + uTilt*0.008, pi = p - uTilt*0.002;
  vec3 H = layerDG(ph, vec4(1, 0, 0, 0));
  vec3 C = layerDG(pc, vec4(0, 1, 0, 0));
  addGlow(acc, ${hx(60, 110, 235)}, glowAt(C.x)*uMisc[1].x*step(0.0, min(C.x, H.x))*smoothstep(600.0, 820.0, RP(p).y));
  // ---- blue header
  if (H.x < 2.0*px) {
    vec2 r = RP(ph);
    float sx = clamp((r.x - 400.0)/460.0, 0.0, 1.0);
    vec3 base = mixS(${hx(37, 89, 244)}, ${hx(95, 206, 249)}, sx);
    base = mixS(base, mixS(${hx(82, 172, 246)}, ${hx(122, 240, 252)}, sx), exp(-max(r.y - 368.0, 0.0)/25.0));
    Mat M;
    M.core = base; M.edge = base; M.coreD = 1.0;
    M.R = 16.0*DS; M.R2 = 1.0; M.k2 = 0.0;
    M.amb = 0.95; M.dif = 0.06; M.spec = 0.30; M.shin = 50.0; M.env = 0.45; M.envBase = 0.02;
    M.rim = 0.30; M.rimC = ${hx(190, 230, 255)};
    M.sss = 0.0; M.sssC = vec3(0.0);
    vec3 n; float depth;
    vec3 c = shadeBase(M, base, H, n, depth);
    c *= mix(0.80, 1.0, smoothstep(0.0, 18.0*DS, C.x)); // card shadow
    over(acc, c, cov(H.x, px));
  }
  // ---- frosted card with the date
  if (C.x < 2.0*px) {
    vec2 r = RP(pc);
    float hz = 1.0 - smoothstep(572.0, 738.0, r.y);
    vec3 base = mixS(${hx(250, 251, 253)}, ${hx(113, 194, 247)}, hz);
    base = mixS(base, ${hx(238, 241, 250)}, smoothstep(750.0, 925.0, r.y));
    vec2 tm = textMask(r);
    base = mixS(base, ${hx(25, 63, 243)}, tm.r);
    base = mixS(base, ${hx(4, 4, 8)}, tm.g);
    Mat M;
    M.core = base; M.edge = base; M.coreD = 1.0;
    M.R = 34.0*DS; M.R2 = 1.0; M.k2 = 0.0;
    M.amb = 0.94; M.dif = 0.08; M.spec = 0.25; M.shin = 40.0; M.env = 0.50; M.envBase = 0.02;
    M.rim = 0.50; M.rimC = ${hx(240, 250, 255)};
    M.sss = 0.0; M.sssC = vec3(0.0);
    vec3 n; float depth;
    vec3 c = shadeBase(M, base, C, n, depth);
    c = mix(c, ${hx(246, 250, 255)}, exp(-depth/(6.0*DS))*0.45);
    c *= 1.0 - 0.18*sin(PI*uMisc[3].x);
    over(acc, c, cov(C.x, px));
  }
  vec4 L = renderEyeLine(pi, px); acc = L + acc*(1.0 - L.a);
  for (int i = 0; i < 2; i++) { vec4 ec = renderEye(i, pi, px, vec3(1.0)); acc = ec + acc*(1.0 - ec.a); }
}
`;

/** GLSL ES 3.00 preamble: lets the GLSL1-style bodies above compile unchanged. */
const FRAGMENT_PREAMBLE = `#version 300 es
#define varying in
#define texture2D texture
precision highp float;
precision highp int;
precision highp sampler2D;
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
`;

const APP_GLSL: Readonly<Record<LivingLogoApp, string>> = {
  mail: MAIL,
  drive: DRIVE,
  contacts: CONTACTS,
  git: GIT,
  calendar: CALENDAR,
};

export function fragmentShader(app: LivingLogoApp): string {
  return FRAGMENT_PREAMBLE + COMMON + APP_GLSL[app] + MAIN;
}
