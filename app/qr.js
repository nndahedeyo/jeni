// 小さな QR 作成（バイト方式・誤り訂正 H・版 1〜12）。ロゴを真ん中に重ねても読めるよう H を使う
function makeQR(text, forceMask) {
  const ECC = [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22], BLK = [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16];
  const bytes = Array.from(new TextEncoder().encode(text));
  const raw = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
  const dataCW = v => Math.floor(raw(v) / 8) - ECC[v] * BLK[v];
  const cc = v => v < 10 ? 8 : 16;   // 文字数を書く長さ（版 10 からは 16）
  let ver = 1; while (ver <= 12 && 4 + cc(ver) + bytes.length * 8 > dataCW(ver) * 8) ver++;
  if (ver > 12) throw new Error("too long");
  const size = ver * 4 + 17, cap = dataCW(ver) * 8;
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, cc(ver)); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
  for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) put(p, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; };
  const deg = ECC[ver], div = new Array(deg).fill(0); div[deg - 1] = 1;
  for (let i = 0, root = 1; i < deg; i++) { for (let j = 0; j < deg; j++) { div[j] = mul(div[j], root); if (j + 1 < deg) div[j] ^= div[j + 1]; } root = mul(root, 2); }
  const rem = d => { const r = new Array(deg).fill(0); d.forEach(b => { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => r[i] ^= mul(c, f)); }); return r; };
  const nb = BLK[ver], rawCW = Math.floor(raw(ver) / 8), nShort = nb - rawCW % nb, shortLen = Math.floor(rawCW / nb);
  const blocks = []; for (let i = 0, k = 0; i < nb; i++) { const d = data.slice(k, k + shortLen - deg + (i < nShort ? 0 : 1)); k += d.length; const e = rem(d); if (i < nShort) d.push(0); blocks.push(d.concat(e)); }
  const all = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - deg || j >= nShort) all.push(b[i]); });
  const M = [...Array(size)].map(() => new Array(size).fill(false)), F = [...Array(size)].map(() => new Array(size).fill(false));
  const fn = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
  for (let i = 0; i < size; i++) { fn(6, i, i % 2 === 0); fn(i, 6, i % 2 === 0); }
  [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && y >= 0 && x < size && y < size) fn(x, y, d !== 2 && d !== 4); } });
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2, p = [6];
    for (let pos = size - 7; p.length < na; pos -= step) p.splice(1, 0, pos);
    p.forEach(ax => p.forEach(ay => { if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); })); }
  const fmt = mask => { const d = (2 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412, g = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) fn(8, i, g(i)); fn(8, 7, g(6)); fn(8, 8, g(7)); fn(7, 8, g(8)); for (let i = 9; i < 15; i++) fn(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) fn(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) fn(8, size - 15 + i, g(i)); fn(8, size - 8, true); };
  if (ver >= 7) {   // 版の情報（7以上）
    let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    const vb = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const bit = ((vb >>> i) & 1) === 1, a = size - 11 + i % 3, b = Math.floor(i / 3); fn(a, b, bit); fn(b, a, bit); }
  }
  fmt(0);
  let i = 0; for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v; if (!F[y][x] && i < all.length * 8) { M[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; } } }
  // 8 通りの模様から、読み取りやすいもの（点数の低いもの）を選ぶ（決まりどおりの数え方）
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
  const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; };
  const score = () => {
    let p = 0; const line = get => { let run = 1, pen = 0; const v = [];
      for (let i = 0; i < size; i++) v.push(get(i));
      for (let i = 1; i <= size; i++) { if (i < size && v[i] === v[i - 1]) run++; else { if (run >= 5) pen += run - 2; run = 1; } }
      for (let i = 0; i + 10 < size + 4; i++) { const at = k => (k < 0 || k >= size) ? false : v[k];
        const pat = [true, false, true, true, true, false, true];
        if (pat.every((b, k) => at(i + k) === b) && ((!at(i - 1) && !at(i - 2) && !at(i - 3) && !at(i - 4)) || (!at(i + 7) && !at(i + 8) && !at(i + 9) && !at(i + 10)))) pen += 40; }
      return pen; };
    for (let y = 0; y < size; y++) p += line(i => M[y][i]);
    for (let x = 0; x < size; x++) p += line(i => M[i][x]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
    let dark = 0; for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (M[y][x]) dark++;
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p; };
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) { apply(m); fmt(m); const sc = score(); if (sc < bestScore) { bestScore = sc; best = m; } apply(m); }
  if (forceMask != null) best = forceMask;
  apply(best); fmt(best);
  return M;
}
