const PX_COLOR = {f:"#ffe0c2",r:"#b8323a",p:"#ff8ac2",k:"#111",d:"#7d7d7d",w:"#f6f5ef",s:"#b3b3b3",g:"#d2d2d2",e:"#fff",y:"#ffe14a",h:"#efeee8",n:"#555"};
const PX = 1.35, PX_W = 32, PX_H = 25; // 캐릭터 약 43×34
// 눈: 까만 테두리 + 큰 흰 눈동자 + 아래 웃는 하이라이트
const EYE = ["..kkkk..", ".kkkkkk.", "kkeeeekk", "kkeeeekk", "kkeeeekk", "kkkeekkk", "kwkkkkwk", ".kwwwwk.", "..kkkk.."];
const HAND_L = [".kk", "khh", "khh", "khh", "khh", ".kk"], HAND_R = ["kk.", "hhk", "hhk", "hhk", "hhk", "kk."];
function pxGrid(h = PX_H){
  const g = Array.from({length: h}, () => Array(PX_W).fill("."));
  const put = (x, y, c) => { if(x >= 0 && x < PX_W && y >= 0 && y < h) g[y][x] = c; };
  const rect = (x, y, w, h, c) => { for(let j = y; j < y+h; j++) for(let i = x; i < x+w; i++) put(i, j, c); };
  // 모서리를 r칸씩 깎은 상자 (테두리 k)
  const box = (x0, y0, x1, y1, fill, r) => {
    for(let y = y0; y <= y1; y++){
      const d = Math.max(0, r - (y - y0), r - (y1 - y));
      for(let x = x0 + d; x <= x1 - d; x++) put(x, y, y === y0 || y === y1 || x === x0 + d || x === x1 - d ? "k" : fill);
    }
  };
  const stamp = (pat, x0, y0) => pat.forEach((row, j) => [...row].forEach((c, i) => { if(c !== ".") put(x0+i, y0+j, c); }));
  return {g, put, rect, box, stamp};
}
function closedEyes(put, rect){ // 감은 눈: 눈 자리 회색으로 덮고 가로줄
  for(const x0 of [5, 19]){ rect(x0, 9, 8, 9, "g"); rect(x0+1, 13, 6, 1, "k"); put(x0, 12, "k"); put(x0+7, 12, "k"); }
}
function trainRows(mood, opts = {}){
  const {g, put, rect, box, stamp} = pxGrid();
  box(10, 0, 21, 4, "d", 1);          // 지붕
  box(3, 2, 28, 22, "g", 2);          // 몸통
  rect(5, 3, 22, 1, "w"); rect(4, 4, 1, 17, "w");   // 빛 받는 쪽
  rect(5, 4, 22, 4, "s");             // 윗부분 짙은 회색
  if(opts.wideSign) box(6, 4, 25, 8, "L", 0); else box(10, 4, 21, 8, "L", 0);   // 행선판
  if(mood === "gone") closedEyes(put, rect);
  else { stamp(EYE, 5, 9); stamp(EYE, 19, 9); }
  rect(4, 18, 24, 3, "L");            // 노선색 띠
  for(const x0 of [6, 21]){ rect(x0, 18, 5, 3, "n"); rect(x0+1, 18, 3, 3, mood === "gone" ? "s" : "y"); }  // 전조등 (못 타면 꺼짐)
  rect(4, 21, 24, 1, "w");
  rect(6, 23, 5, 2, "n"); rect(21, 23, 5, 2, "n");   // 바퀴
  stamp(HAND_L, 0, 15);
  if(mood !== "mine") stamp(HAND_R, 29, 15);         // 내 열차는 오른손을 따로 그려서 흔듦
  return g.map(row => row.join(""));
}
// 입 모양: 웃는 입 ‿, 벌린 입 O (역 도착·놀람), 도착하면 볼이 발그레
const MOUTH_SMILE = t => { t.put(14, 15, "k"); t.put(17, 15, "k"); t.rect(15, 16, 2, 1, "k"); };
const MOUTH_OPEN = t => { t.rect(15, 14, 2, 1, "k"); t.put(14, 15, "k"); t.put(17, 15, "k"); t.rect(15, 15, 2, 2, "r"); t.put(14, 16, "k"); t.put(17, 16, "k"); t.rect(15, 17, 2, 1, "k"); };
const CHEEKS = t => { t.rect(4, 16, 2, 1, "p"); t.rect(26, 16, 2, 1, "p"); };
function overlayRows(draw, h){ const t = pxGrid(h); draw(t); return t.g.map(row => row.join("")); }
function pxRects(rows, color){
  let out = "";
  rows.forEach((row, y) => {
    for(let x = 0; x < row.length; ){
      const c = row[x]; let w = 1;
      while(row[x+w] === c) w++;
      if(c !== ".") out += `<rect x="${x}" y="${y}" width="${w + .04}" height="1.04" fill="${c === "L" ? color : PX_COLOR[c]}"/>`; // 살짝 겹쳐서 칸 사이 실금 안 보이게
      x += w;
    }
  });
  return out;
}
const TRAIN_MOUTH = [
  t => { t.put(14, 15, "k"); t.put(17, 15, "k"); t.rect(15, 16, 2, 1, "k"); },
  t => { t.rect(14, 16, 4, 1, "k"); },
  t => { t.stamp([".kk.", "krrk", ".kk."], 14, 15); },
  t => { t.stamp([".kk.", "krrk", "krrk", ".kk."], 14, 14); },
  t => { t.stamp([".kk.", "krrk", "krrk", "krrk", ".kk."], 14, 13); },
  t => { t.rect(15, 16, 2, 1, "k"); },
];
// 늦은 정도 단계(0~5)대로 표정 짓는 열차 얼굴. 5(짱늦음)는 눈 감고 전조등 꺼짐
function trainFace(color, level, opts = {}){
  const ov = draw => pxRects(overlayRows(draw), color);
  return pxRects(trainRows(level >= 5 ? "gone" : "can", opts), color)
    + (level < 5 ? `<g class="lid">${ov(t => closedEyes(t.put, t.rect))}</g>` : "")
    + ov(TRAIN_MOUTH[level]);
}

export function character(color,level=0){return `<svg viewBox="-2 -2 36 29" role="img" aria-label="쟈철 열차 캐릭터" shape-rendering="crispEdges">${trainFace(color,level)}</svg>`;}
