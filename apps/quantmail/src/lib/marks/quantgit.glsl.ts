/**
 * QuantGit's mark, as ~40 lines of SDF on top of the shared graphite material.
 *
 * WHY NOT GIT'S OWN LOGO. The brief asked for Git's mark inside the plate. It
 * is not ours to put there: the Git logo is Jason Long's, licensed CC-BY 3.0,
 * which means attribution travels with every use — including our favicon and
 * our OG images. Neither GitHub nor GitLab embeds it in their own mark for
 * exactly that reason. Its `#F05033` also sits a few degrees off `#FF8C42`, so
 * the two reds would fight in every place they appeared together.
 *
 * So the motif is the thing the logo *means* rather than the logo: a commit
 * graph — a trunk, one branch leaving it, three commits. It is legible at 16px,
 * it is ours, and it says "version control" without saying "markup", which is
 * what the `</>` chevrons this replaced actually said.
 *
 * WHY THE GRAPH IS MILLED, NOT DRAWN. Printing the graph on the face would make
 * it a sticker on a slab. Cutting it *into* the face and lighting it from the
 * floor of the cut means the accent is structural: the graph is where the object
 * is thin enough for its own heat to show through. That is also what survives
 * being scaled down — a channel with a lit floor keeps its contrast at 16px,
 * where a 1.8-weight stroke turns to mush.
 *
 * EMBER RATIO ~4%. The lowest in the family. QuantGit is an instrument, and an
 * instrument is mostly metal; the ember is the reading, not the housing.
 */
export const QUANTGIT_SDF_GLSL = String.raw`
/** L4 superellipse, the same silhouette family as AppMark.tsx's squircle path.
 *  Scaled by 0.8 because a p-norm is not a Euclidean distance — under-reporting
 *  keeps the march conservative instead of letting it tunnel through a corner. */
float sdSquircle2D(vec2 p, float a) {
  vec2 q = abs(p) / a;
  float k = pow(pow(q.x, 4.0) + pow(q.y, 4.0), 0.25);
  return (k - 1.0) * a * 0.8;
}

float markPlate(vec3 p) {
  // Rounded by 0.030 on every edge — a chamfer, not a dome. The first pass used
  // 0.062, which is 40% of the plate's half-thickness, and a round-over that deep
  // catches the key light as a broad soft dome: a black plastic button, i.e. the
  // candy-3D read the whole material exists to reject. At 0.030 the same light
  // lands as a tight line along the top edge, which is what a milled chamfer does.
  const float R = 0.030;
  float d2 = sdSquircle2D(p.xy, PLATE_HALF - R);
  vec2 w = vec2(d2, abs(p.z) - (PLATE_Z - R));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - R;
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float sminK(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float markChannel(vec2 uv, out float hot) {
  // The three commits, carried over from the 32x32 SVG so the WebGL hero and the
  // favicon are the same mark: (10.53,8.22) (10.53,23.78) (21.47,18.93), mapped
  // from SVG space (y down, 0..32) into object space (y up, +-0.62) at the
  // squircle's real scale — 14.75 SVG units per 0.62 object units. The first pass
  // used 16 per 0.62, which quietly made the twin's graph 8.5% larger than the
  // hero's; two marks that are supposed to be provably identical cannot differ by
  // a factor nobody wrote down.
  //
  // The whole graph is 1.32x the first draft. At the original size the glyph filled
  // 43% of the plate's width, and a mark whose subject uses two-fifths of its own
  // frame reads as timid — the plate was the loudest thing about it.
  vec2 a = vec2(-0.230,  0.327);
  vec2 b = vec2(-0.230, -0.327);
  vec2 c = vec2( 0.230, -0.123);
  vec2 m = vec2(-0.230,  0.103);   // where the branch leaves the trunk
  vec2 e = vec2( 0.000,  0.000);   // the elbow, rounded by sminK below

  float trunk = sdSeg(uv, a, b);
  float branch = sminK(sdSeg(uv, m, e), sdSeg(uv, e, c), 0.073);

  // Commits are wider pockets, and the only places that reach full brightness.
  // A commit is an event; the line between two commits is only history.
  // 0.038, not 0.050: the cut is now 0.052 wide on its own, and 0.050 on top of
  // that made a pocket 19% of the plate — three orange blobs joined by a groove
  // rather than a graph with commits on it.
  float nodes = min(min(length(uv - a), length(uv - b)), length(uv - c)) - 0.038;
  hot = 1.0 - smoothstep(-0.018, 0.052, nodes);

  return min(min(trunk, branch), nodes);
}
`;
