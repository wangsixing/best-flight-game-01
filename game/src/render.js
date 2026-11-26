// Ridge Runner — everything the pilot sees.
// One file, one job: project the 3D valley onto the 2D canvas, draw the sky,
// terrain, rings, runway and the chase-view plane, then the HUD and the
// title / end screens. No game logic lives here, only drawing.

import { FLIGHT, FUEL, MISSIONS, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_OUT_OF_FUEL, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, WORLD } from './config.js';
import { clamp, fbm, lerp } from './random.js';
import { courseHeading, terrainHeight } from './terrain.js';
import { nextGate, wrapAngle } from './flight.js';

const TAU = Math.PI * 2;
const FOV = (68 * Math.PI) / 180;

/** Sky / fog palette blended by the mission's dusk factor (0 = morning, 1 = sunset). */
function palette(dusk) {
  return {
    skyTop: mixColor([58, 122, 190], [52, 48, 96], dusk),
    skyMid: mixColor([135, 190, 225], [214, 122, 82], dusk),
    horizon: mixColor([214, 232, 244], [255, 178, 110], dusk),
    fog: mixColor([196, 216, 228], [244, 172, 118], dusk),
    sun: mixColor([255, 244, 200], [255, 138, 60], dusk),
    sunCore: mixColor([255, 252, 235], [255, 196, 110], dusk),
  };
}

function mixColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function rgb(c, alpha) {
  return alpha === undefined
    ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
    : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
}

/** A camera basis built from the plane: chase position, look direction. */
function makeCamera(plane, w, h) {
  const yaw = plane.heading;
  const pitch = plane.pitch * 0.35 + 0.05;
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const sinP = Math.sin(pitch);
  const cosP = Math.cos(pitch);
  // Chase: 16 m behind the plane, 4.5 m above it.
  const cam = {
    x: plane.x - sinY * 16,
    y: plane.y + 4.5,
    z: plane.z - cosY * 16,
    fx: sinY * cosP,
    fy: sinP,
    fz: cosY * cosP,
    rx: cosY,
    ry: 0,
    rz: -sinY,
  };
  // up = forward x right (right-handed: forward cross right points up).
  cam.ux = cam.fy * cam.rz - cam.fz * cam.ry;
  cam.uy = cam.fz * cam.rx - cam.fx * cam.rz;
  cam.uz = cam.fx * cam.ry - cam.fy * cam.rx;
  cam.focal = (h / 2) / Math.tan(FOV / 2);
  cam.cx = w / 2;
  cam.cy = h / 2;
  cam.pitch = pitch;
  return cam;
}

/** Project a world point to screen space; null when behind the camera. */
function project(cam, x, y, z) {
  const dx = x - cam.x;
  const dy = y - cam.y;
  const dz = z - cam.z;
  const zc = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  if (zc < 1.5) return null;
  const xc = dx * cam.rx + dy * cam.ry + dz * cam.rz;
  const yc = dx * cam.ux + dy * cam.uy + dz * cam.uz;
  return {
    x: cam.cx + (xc * cam.focal) / zc,
    y: cam.cy - (yc * cam.focal) / zc,
    dist: zc,
  };
}

/** Screen y of the horizon line (eye level, far ahead). */
function horizonY(cam) {
  const p = project(cam, cam.x + cam.fx * 4000, cam.y, cam.z + cam.fz * 4000);
  return p ? p.y : cam.cy;
}

// --- Terrain colour ---------------------------------------------------------
function terrainColor(y, slope, dist, pal, tint) {
  let base;
  if (y < WORLD.waterLevel) base = [38, 110, 150]; // river water
  else if (y < 12) base = [102, 140, 78]; // valley grass
  else if (y < 46) base = [80, 118, 64]; // forest floor
  else if (y < 95) base = [112, 98, 70]; // dry slopes
  else if (y < 150) base = [128, 116, 108]; // rock
  else base = [232, 234, 240]; // snow
  // Slope shading: steep faces go darker.
  const shade = clamp(1 - slope * 0.9, 0.55, 1) * (tint || 1);
  // Distance haze.
  const fog = clamp((dist - WORLD.fogNear) / (WORLD.fogFar - WORLD.fogNear), 0, 1);
  const c = [
    lerp(base[0] * shade, pal.fog[0], fog),
    lerp(base[1] * shade, pal.fog[1], fog),
    lerp(base[2] * shade, pal.fog[2], fog),
  ];
  return rgb(c);
}

// --- Sky --------------------------------------------------------------------
function drawSky(ctx, w, h, cam, pal, sortie, time) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgb(pal.skyTop));
  grad.addColorStop(0.55, rgb(pal.skyMid));
  grad.addColorStop(0.75, rgb(pal.horizon));
  grad.addColorStop(1, rgb(pal.horizon));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const hy = horizonY(cam);
  // Distant ridge silhouettes, two layers, parallaxed by heading.
  for (let layer = 0; layer < 2; layer += 1) {
    const amp = layer === 0 ? 46 : 90;
    const base = hy + (layer === 0 ? 6 : 26);
    const shade = layer === 0 ? 0.55 : 0.8;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let sx = 0; sx <= w; sx += 16) {
      const n = fbm(sx * 0.004 + cam.pitch * 40 + layer * 31.7, 7.3 + layer * 5, 77);
      ctx.lineTo(sx, base - (n * 0.5 + 0.5) * amp - layer * 8);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = rgb(mixColor(pal.fog, [70, 90, 110], shade), 0.85);
    ctx.fill();
  }

  // Sun: low and warm, ahead and to the left of the course.
  const sunAz = -0.55; // fixed world azimuth, just left of the northbound course
  const sunEl = lerp(0.5, 0.1, sortie.world.mission.dusk);
  const sunDir = { x: Math.sin(sunAz) * Math.cos(sunEl), y: Math.sin(sunEl), z: Math.cos(sunAz) * Math.cos(sunEl) };
  const sp = project(cam, cam.x + sunDir.x * 3000, cam.y + sunDir.y * 3000, cam.z + sunDir.z * 3000);
  if (sp && sp.x > -80 && sp.x < w + 80 && sp.y > -80 && sp.y < h) {
    const glow = ctx.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 150);
    glow.addColorStop(0, rgb(pal.sunCore, 0.95));
    glow.addColorStop(0.25, rgb(pal.sun, 0.55));
    glow.addColorStop(1, rgb(pal.sun, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sp.x - 150, sp.y - 150, 300, 300);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 26, 0, TAU);
    ctx.fillStyle = rgb(pal.sunCore, 0.95);
    ctx.fill();
  }

  // Clouds: soft billboards drifting slowly across the valley.
  for (const cloud of sortie.world.clouds) {
    const cx = cloud.x + cloud.drift * time;
    const p = project(cam, cx, cloud.y, cloud.z);
    if (!p) continue;
    const scale = (cloud.scale * cam.focal) / p.dist;
    if (scale < 6 || p.x < -scale * 2 || p.x > w + scale * 2 || p.y < -40 || p.y > hy + 40) continue;
    ctx.fillStyle = rgb([255, 255, 255], 0.82);
    // One fill per ellipse: three subpaths in a single path cancel where
    // they overlap (winding), leaving triangular holes in the cloud.
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, scale, scale * 0.34, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x - scale * 0.55, p.y + scale * 0.08, scale * 0.62, scale * 0.26, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(p.x + scale * 0.55, p.y + scale * 0.06, scale * 0.66, scale * 0.28, 0, 0, TAU);
    ctx.fill();
  }
}

// --- Terrain mesh -----------------------------------------------------------
const ROW_DISTANCES = [22, 34, 50, 70, 94, 122, 156, 196, 242, 296, 360, 436, 526, 640];

function drawTerrain(ctx, w, h, cam, sortie) {
  const mission = sortie.world.mission;
  const pal = palette(mission.dusk);
  const cols = 27;
  const halfWide = WORLD.viewWide;
  // Sample the grid in camera space: rows ahead, columns across.
  const grid = [];
  for (let r = 0; r < ROW_DISTANCES.length; r += 1) {
    const d = ROW_DISTANCES[r];
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      const lat = -halfWide + (c / (cols - 1)) * halfWide * 2;
      const wx = cam.x + cam.fx * d + cam.rx * lat;
      const wz = cam.z + cam.fz * d + cam.rz * lat;
      const wy = terrainHeight(wx, wz, mission);
      row.push({ p: project(cam, wx, wy, wz), y: wy, wx, wz, dist: d });
    }
    grid.push(row);
  }
  // Paint far to near so near quads cover far ones.
  for (let r = grid.length - 2; r >= 0; r -= 1) {
    const rowA = grid[r];
    const rowB = grid[r + 1];
    for (let c = 0; c < cols - 1; c += 1) {
      const a = rowA[c];
      const b = rowA[c + 1];
      const cc = rowB[c + 1];
      const d = rowB[c];
      if (!a.p || !b.p || !cc.p || !d.p) continue;
      const midY = (a.y + b.y + cc.y + d.y) / 4;
      const slope = Math.abs(b.y - a.y) / WORLD.cellSize + Math.abs(d.y - a.y) / WORLD.cellSize;
      const midDist = (a.dist + cc.dist) / 2;
      const runway = sortie.world.runway;
      const overRunway =
        runway.contains((a.wx + cc.wx) / 2, (a.wz + cc.wz) / 2) && midY < WORLD.fieldElevation + 3;
      if (overRunway) {
        // Asphalt with a white centreline dash.
        const local = runway.local((a.wx + cc.wx) / 2, (a.wz + cc.wz) / 2);
        const dash = Math.floor((local.along + 600) / 26) % 2 === 0 && Math.abs(local.across) < 1.6;
        const fog = clamp((midDist - WORLD.fogNear) / (WORLD.fogFar - WORLD.fogNear), 0, 1);
        const asphalt = [52, 54, 60];
        const c = dash
          ? [235, 235, 225]
          : [lerp(asphalt[0], pal.fog[0], fog), lerp(asphalt[1], pal.fog[1], fog), lerp(asphalt[2], pal.fog[2], fog)];
        ctx.fillStyle = rgb(c);
      } else {
        // A little deterministic mottling per quad, so the valley floor
        // reads as ground rather than flat bands of colour.
        const midX = (a.wx + cc.wx) / 2;
        const midZ = (a.wz + cc.wz) / 2;
        const tint = 0.93 + (fbm(midX * 0.02, midZ * 0.02, 5) * 0.5 + 0.5) * 0.14;
        ctx.fillStyle = terrainColor(midY, slope, midDist, pal, tint);
      }
      ctx.beginPath();
      ctx.moveTo(a.p.x, a.p.y);
      ctx.lineTo(b.p.x, b.p.y);
      ctx.lineTo(cc.p.x, cc.p.y);
      ctx.lineTo(d.p.x, d.p.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// --- Rings ------------------------------------------------------------------
function drawRings(ctx, cam, sortie) {
  const mission = sortie.world.mission;
  const pal = palette(mission.dusk);
  const next = nextGate(sortie);
  // Far rings first so the near ones draw over them.
  const sorted = [...sortie.world.gates].sort((a, b) => b.z - a.z);
  for (const gate of sorted) {
    if (gate.passed && gate !== next) continue;
    const p = project(cam, gate.x, gate.y, gate.z);
    if (!p) continue;
    const r = (gate.radius * cam.focal) / p.dist;
    if (!Number.isFinite(r) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      console.warn('non-finite ring', JSON.stringify({ gate: gate.index, x: p.x, y: p.y, dist: p.dist, r, focal: cam.focal }));
      continue;
    }
    if (r < 2) continue;
    const isNext = gate === next;
    const colour = isNext ? [255, 205, 70] : [96, 196, 255];
    const alpha = isNext ? 1 : clamp(1 - p.dist / 900, 0.25, 0.75);
    const glow = ctx.createRadialGradient(p.x, p.y, r * 0.4, p.x, p.y, r * 1.25);
    glow.addColorStop(0, rgb(colour, 0));
    glow.addColorStop(0.75, rgb(colour, 0.16 * alpha));
    glow.addColorStop(1, rgb(colour, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - r * 1.3, p.y - r * 1.3, r * 2.6, r * 2.6);
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.strokeStyle = rgb(colour, 0.9 * alpha);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.96, 0, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.strokeStyle = rgb([255, 255, 255], 0.85 * alpha);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 0.82, r * 0.78, 0, 0, TAU);
    ctx.stroke();
    if (isNext && sortie.screen !== SCREEN_TITLE) {
      // Distance to the next ring, written under it.
      ctx.fillStyle = rgb([255, 240, 200], 0.95);
      ctx.font = `bold ${Math.max(13, r * 0.16)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`GATE ${gate.index + 1} — ${Math.round(p.dist)} m`, p.x, p.y + r + 26);
    }
  }
  return pal;
}

// --- The plane (chase view) -------------------------------------------------
function drawPlane(ctx, w, h, plane, time) {
  const cx = w / 2;
  const cy = h * 0.68 + plane.pitch * 60;
  const scale = Math.min(w, h) / 620;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  ctx.scale(scale, scale);

  // Propeller blur disc at the nose (top of the drawing): a near-horizontal
  // shimmer, never tilted — a spinning disc is symmetric, so a rotated
  // ellipse only reads as a grey bar across the sky.
  ctx.save();
  ctx.translate(0, -148);
  ctx.fillStyle = 'rgba(235,240,245,0.2)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 74, 13, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(235,240,245,0.12)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 52, 9, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Main wings: swept, with red/green nav lights at the tips.
  ctx.fillStyle = '#e8e2d2';
  ctx.strokeStyle = '#8a2f24';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-14, -58);
  ctx.lineTo(-168, -30);
  ctx.lineTo(-168, -12);
  ctx.lineTo(-14, -28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14, -58);
  ctx.lineTo(168, -30);
  ctx.lineTo(168, -12);
  ctx.lineTo(14, -28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Wingtip lights.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-166, -20, 6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#34d17b';
  ctx.beginPath();
  ctx.arc(166, -20, 6, 0, TAU);
  ctx.fill();

  // Fuselage: cream body with a red cheatline, tapering to the nose.
  const body = ctx.createLinearGradient(-26, 0, 26, 0);
  body.addColorStop(0, '#c9bda6');
  body.addColorStop(0.5, '#f4efe2');
  body.addColorStop(1, '#c9bda6');
  ctx.fillStyle = body;
  ctx.strokeStyle = '#7a5a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-20, 118);
  ctx.quadraticCurveTo(-30, 20, -22, -96);
  ctx.quadraticCurveTo(-18, -138, 0, -146);
  ctx.quadraticCurveTo(18, -138, 22, -96);
  ctx.quadraticCurveTo(30, 20, 20, 118);
  ctx.quadraticCurveTo(0, 130, -20, 118);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Red cheatline down the fuselage.
  ctx.fillStyle = '#a93226';
  ctx.beginPath();
  ctx.moveTo(-24, 96);
  ctx.quadraticCurveTo(-27, 20, -21, -70);
  ctx.lineTo(-13, -70);
  ctx.quadraticCurveTo(-17, 20, -15, 96);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(24, 96);
  ctx.quadraticCurveTo(27, 20, 21, -70);
  ctx.lineTo(13, -70);
  ctx.quadraticCurveTo(17, 20, 15, 96);
  ctx.closePath();
  ctx.fill();

  // Cockpit windows.
  ctx.fillStyle = '#1d2f45';
  ctx.beginPath();
  ctx.moveTo(-15, -84);
  ctx.lineTo(-13, -58);
  ctx.lineTo(-2, -58);
  ctx.lineTo(-2, -84);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(15, -84);
  ctx.lineTo(13, -58);
  ctx.lineTo(2, -58);
  ctx.lineTo(2, -84);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-14, -80, 5, 18);
  ctx.fillRect(9, -80, 5, 18);

  // Tailplane and fin (nearest the camera, at the bottom).
  ctx.fillStyle = '#e8e2d2';
  ctx.strokeStyle = '#8a2f24';
  ctx.beginPath();
  ctx.moveTo(-10, 92);
  ctx.lineTo(-62, 108);
  ctx.lineTo(-62, 120);
  ctx.lineTo(-10, 108);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, 92);
  ctx.lineTo(62, 108);
  ctx.lineTo(62, 120);
  ctx.lineTo(10, 108);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Vertical fin: it rises from the tail upward along the fuselage (the
  // camera looks down the plane's back, so the fin points up-screen).
  ctx.fillStyle = '#a93226';
  ctx.beginPath();
  ctx.moveTo(-9, 112);
  ctx.lineTo(0, 56);
  ctx.lineTo(9, 112);
  ctx.closePath();
  ctx.fill();
  // Tail strobe, blinking.
  if (Math.floor(time * 1.6) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 124, 4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// --- HUD --------------------------------------------------------------------
function drawHud(ctx, w, h, sortie, time) {
  const plane = sortie.plane;
  const mission = sortie.world.mission;
  const pad = 16;
  const next = nextGate(sortie);
  ctx.textBaseline = 'alphabetic';

  // Top-left: mission, score, gate counter.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10,16,24,0.55)';
  roundRect(ctx, pad - 8, pad - 6, 250, 86, 10);
  ctx.fill();
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(mission.name, pad, pad + 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`SCORE ${sortie.score}`, pad, pad + 48);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#cfe3f2';
  const gateText = `GATE ${sortie.gatesPassed}/${sortie.world.gates.length}`;
  ctx.fillText(gateText, pad, pad + 70);
  // Gate dots.
  for (let i = 0; i < sortie.world.gates.length; i += 1) {
    const gx = pad + 118 + i * 15;
    ctx.beginPath();
    ctx.arc(gx, pad + 65, 4.5, 0, TAU);
    ctx.fillStyle = sortie.world.gates[i].passed ? '#34d17b' : 'rgba(255,255,255,0.35)';
    ctx.fill();
  }

  // Top-centre: heading tape.
  const tapeW = 320;
  const tapeX = w / 2 - tapeW / 2;
  ctx.fillStyle = 'rgba(10,16,24,0.55)';
  roundRect(ctx, tapeX, pad - 6, tapeW, 44, 10);
  ctx.fill();
  const headingDeg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
  ctx.save();
  ctx.beginPath();
  ctx.rect(tapeX, pad - 6, tapeW, 44);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 15) {
    const deg = Math.round((headingDeg + d) / 15) * 15;
    const norm = ((deg % 360) + 360) % 360;
    const sx = w / 2 + (d / 15) * 40;
    if (sx < tapeX + 16 || sx > tapeX + tapeW - 16) continue;
    const label = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[norm] || String(norm);
    ctx.fillText(label, sx, pad + 24);
    ctx.fillRect(sx - 0.5, pad + 30, 1, 6);
  }
  ctx.restore();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 7, pad + 38);
  ctx.lineTo(w / 2 + 7, pad + 38);
  ctx.lineTo(w / 2, pad + 28);
  ctx.closePath();
  ctx.fill();

  // Top-right: ALT / SPD / HDG readouts.
  const altFt = Math.round(plane.y * 3.281);
  const spdKt = Math.round(plane.speed * 1.944);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(10,16,24,0.55)';
  roundRect(ctx, w - pad - 218, pad - 6, 218, 86, 10);
  ctx.fill();
  ctx.fillStyle = '#9fd8ff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('ALTITUDE', w - pad - 148, pad + 18);
  ctx.fillText('AIRSPEED', w - pad - 148, pad + 44);
  ctx.fillText('HEADING', w - pad - 148, pad + 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px ui-monospace, monospace';
  ctx.fillText(`${altFt} FT`, w - pad - 8, pad + 20);
  ctx.fillText(`${spdKt} KT`, w - pad - 8, pad + 46);
  ctx.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}°`, w - pad - 8, pad + 72);

  // Bottom-left: artificial horizon.
  const ahX = pad + 52;
  const ahY = h - pad - 52;
  const ahR = 46;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ahX, ahY, ahR, 0, TAU);
  ctx.clip();
  ctx.translate(ahX, ahY);
  ctx.rotate(-plane.roll);
  const pitchOff = clamp(plane.pitch * 90, -ahR, ahR);
  ctx.fillStyle = '#5fa8dd';
  ctx.fillRect(-ahR, -ahR - pitchOff, ahR * 2, ahR + pitchOff);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-ahR, -pitchOff, ahR * 2, ahR + pitchOff);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-ahR, -pitchOff);
  ctx.lineTo(ahR, -pitchOff);
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ahX, ahY, ahR, 0, TAU);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Fixed wings on the dial.
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ahX - 34, ahY);
  ctx.lineTo(ahX - 10, ahY);
  ctx.moveTo(ahX + 10, ahY);
  ctx.lineTo(ahX + 34, ahY);
  ctx.stroke();
  ctx.fillStyle = '#cfe3f2';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', ahX, ahY + ahR + 16);

  // Bottom-right: throttle bar and fuel gauge.
  const gaugeX = w - pad - 150;
  const gaugeY = h - pad - 96;
  ctx.fillStyle = 'rgba(10,16,24,0.55)';
  roundRect(ctx, gaugeX - 8, gaugeY - 8, 166, 104, 10);
  ctx.fill();
  ctx.fillStyle = '#cfe3f2';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THROTTLE', gaugeX, gaugeY + 12);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(gaugeX, gaugeY + 20, 150, 10);
  ctx.fillStyle = '#57c8ff';
  ctx.fillRect(gaugeX, gaugeY + 20, 150 * plane.throttle, 10);
  ctx.fillStyle = '#cfe3f2';
  ctx.fillText('FUEL', gaugeX, gaugeY + 52);
  const fuelFrac = plane.fuel / mission.fuel;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(gaugeX, gaugeY + 60, 150, 10);
  ctx.fillStyle = fuelFrac < 0.25 ? '#ff5a4d' : fuelFrac < 0.5 ? '#ffb84d' : '#34d17b';
  ctx.fillRect(gaugeX, gaugeY + 60, 150 * fuelFrac, 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.ceil(plane.fuel)}`, gaugeX + 150, gaugeY + 52);

  // Centre: flight-path marker and next-gate pointer.
  const markerX = w / 2 + plane.roll * 40;
  const markerY = h * 0.5 - plane.pitch * 120;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(markerX, markerY, 10, 0, TAU);
  ctx.moveTo(markerX - 18, markerY);
  ctx.lineTo(markerX - 10, markerY);
  ctx.moveTo(markerX + 10, markerY);
  ctx.lineTo(markerX + 18, markerY);
  ctx.moveTo(markerX, markerY - 18);
  ctx.lineTo(markerX, markerY - 10);
  ctx.stroke();
  if (next) {
    // Arrow at the screen edge pointing toward the next ring.
    const dx = next.x - plane.x;
    const dz = next.z - plane.z;
    const rel = wrapAngle(Math.atan2(dx, dz) - plane.heading);
    if (Math.abs(rel) > 0.35) {
      const ax = w / 2 + Math.sin(rel) * 150;
      const ay = h * 0.42;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(rel);
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(12, 10);
      ctx.lineTo(-12, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // Warnings.
  const ground = terrainHeight(plane.x, plane.z, mission);
  const clearance = plane.y - ground;
  if (sortie.screen === SCREEN_PLAY && clearance < 30 && plane.verticalSpeed < -2) {
    const blink = Math.floor(time * 3) % 2 === 0;
    if (blink) {
      ctx.fillStyle = '#ff5a4d';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PULL UP', w / 2, h * 0.3);
    }
  }
  if (sortie.screen === SCREEN_PLAY && plane.fuel < FUEL.reserveWarn) {
    ctx.fillStyle = plane.fuel < 12 ? '#ff5a4d' : '#ffb84d';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOW FUEL — HEAD FOR THE RUNWAY', w / 2, h - pad - 110);
  }

  // Centre message and score popups.
  if (sortie.message && sortie.time < sortie.messageUntil) {
    ctx.fillStyle = 'rgba(10,16,24,0.6)';
    const mw = ctx.measureText(sortie.message).width + 36;
    ctx.font = 'bold 22px system-ui, sans-serif';
    const mw2 = ctx.measureText(sortie.message).width + 36;
    roundRect(ctx, w / 2 - mw2 / 2, h * 0.2 - 30, mw2, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.textAlign = 'center';
    ctx.fillText(sortie.message, w / 2, h * 0.2);
  }
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  sortie.popups = sortie.popups.filter((p) => sortie.time < p.until);
  sortie.popups.forEach((p, i) => {
    const age = 1 - (p.until - sortie.time) / 1.6;
    ctx.fillStyle = `rgba(255,255,255,${1 - age})`;
    ctx.fillText(p.text, w / 2, h * 0.34 + i * 26 - age * 24);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// --- Screens ----------------------------------------------------------------
export function titleMissionRects(w, h) {
  // One rect per mission row on the title screen (for clicks).
  const rowW = 560;
  const rowH = 64;
  const x = w / 2 - rowW / 2;
  const y0 = h * 0.52;
  return MISSIONS.map((m, i) => ({ mission: m.id, x, y: y0 + i * (rowH + 12), w: rowW, h: rowH }));
}

function drawTitle(ctx, w, h, sortie, time) {
  ctx.fillStyle = 'rgba(8,14,24,0.45)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 64px system-ui, sans-serif';
  ctx.fillText('RIDGE RUNNER', w / 2, h * 0.22);
  ctx.fillStyle = '#ffffff';
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('A bush-plane valley run — thread the rings, mind the fuel, land it home.', w / 2, h * 0.22 + 38);
  ctx.fillStyle = '#cfe3f2';
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('Fly with arrow keys / WASD or the mouse · W/S throttle · P pause · R restart · M mute', w / 2, h * 0.22 + 66);

  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillStyle = '#ffd34d';
  ctx.fillText('CHOOSE YOUR SORTIE — PRESS 1, 2 OR 3, OR CLICK', w / 2, h * 0.47);
  const rects = titleMissionRects(w, h);
  rects.forEach((rect, i) => {
    const m = MISSIONS[i];
    const hover = sortie.hoverMission === m.id;
    ctx.fillStyle = hover ? 'rgba(255,211,77,0.25)' : 'rgba(10,16,24,0.65)';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();
    ctx.strokeStyle = hover ? '#ffd34d' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`${i + 1} · ${m.name}`, rect.x + 18, rect.y + 28);
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(m.difficulty, rect.x + rect.w - 78, rect.y + 27);
    ctx.fillStyle = '#cfe3f2';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(`${m.tag} — ${m.gates} rings`, rect.x + 18, rect.y + 50);
  });
  const pulse = 0.6 + 0.4 * Math.sin(time * 2.4);
  ctx.fillStyle = `rgba(255,255,255,${pulse})`;
  ctx.font = '15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Best score this session: ' + sortie.best, w / 2, h * 0.52 + MISSIONS.length * 76 + 26);
}

function drawPaused(ctx, w, h) {
  ctx.fillStyle = 'rgba(8,14,24,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.fillText('PAUSED', w / 2, h * 0.45);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = '#cfe3f2';
  ctx.fillText('P to resume · R to restart · 1/2/3 to change mission', w / 2, h * 0.45 + 36);
}

function drawEnd(ctx, w, h, sortie) {
  const landed = sortie.screen === SCREEN_LANDED;
  const outOfFuel = sortie.screen === SCREEN_OUT_OF_FUEL;
  ctx.fillStyle = landed ? 'rgba(8,26,16,0.55)' : 'rgba(30,8,8,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = landed ? '#7be495' : '#ff8a7a';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText(landed ? 'MISSION COMPLETE' : outOfFuel ? 'OUT OF FUEL' : 'CRASHED', w / 2, h * 0.36);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText(sortie.crashReason, w / 2, h * 0.36 + 38);
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(`SCORE ${sortie.score}`, w / 2, h * 0.36 + 92);
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillStyle = '#cfe3f2';
  const mission = sortie.world.mission;
  ctx.fillText(
    `${mission.name} · Gates ${sortie.gatesPassed}/${mission.gates} · Time ${Math.round(sortie.time)}s · Fuel left ${Math.max(0, Math.round(sortie.plane.fuel))}`,
    w / 2,
    h * 0.36 + 126,
  );
  const pulse = 0.6 + 0.4 * Math.sin(sortie.time * 2.4);
  ctx.fillStyle = `rgba(255,255,255,${pulse})`;
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('Press R to fly again · 1/2/3 for another mission', w / 2, h * 0.36 + 168);
}

// --- Main entry -------------------------------------------------------------
/** Draw one frame of the game (world + HUD + screens). */
export function render(ctx, w, h, sortie, time) {
  const mission = sortie.world.mission;
  const pal = palette(mission.dusk);
  const cam = makeCamera(sortie.plane, w, h);
  drawSky(ctx, w, h, cam, pal, sortie, time);
  drawTerrain(ctx, w, h, cam, sortie);
  drawRings(ctx, cam, sortie);
  drawPlane(ctx, w, h, sortie.plane, time);
  // Soft vignette for a cinematic frame.
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  if (sortie.screen === SCREEN_PLAY) drawHud(ctx, w, h, sortie, time);
  else if (sortie.screen === SCREEN_TITLE) drawTitle(ctx, w, h, sortie, time);
  else if (sortie.screen === SCREEN_PAUSED) {
    drawHud(ctx, w, h, sortie, time);
    drawPaused(ctx, w, h);
  } else if (
    sortie.screen === SCREEN_CRASHED ||
    sortie.screen === SCREEN_LANDED ||
    sortie.screen === SCREEN_OUT_OF_FUEL
  ) {
    drawHud(ctx, w, h, sortie, time);
    drawEnd(ctx, w, h, sortie);
  }
}
