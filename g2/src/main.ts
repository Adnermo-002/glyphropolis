// Glyphropolis v2 — main game orchestrator.

import { CELL_SIZES, CFG, DAYNAME, DISTRICT_NAME, PALETTES, WEATHER_NAME, type PaletteId } from './config';
import { AudioEngine } from './core/audio';
import { Input } from './core/input';
import { loadSave, writeSave, type SaveData } from './core/save';
import { randomSeed } from './core/rng';
import { computeDayNight } from './render/daynight';
import { Pipeline } from './render/pipeline';
import { Weather } from './render/weather';
import { Collectibles } from './entities/collectibles';
import { Pedestrians } from './entities/pedestrians';
import { Traffic } from './entities/traffic';
import { Avatar } from './player/avatar';
import { ChaseCamera } from './player/camera';
import { Player } from './player/player';
import { isSea, LANDMARKS } from './world/districts';
import { World } from './world/world';
import { Hud } from './ui/hud';
import { MapOverlay } from './ui/map';

type AppState = 'boot' | 'play' | 'menu';

const LM_DESC: Record<string, string> = {
  spire: '全城最高的艺术装饰塔，35 米处是可落脚的观景环廊。',
  pagoda: '五重飞檐的木构塔阁，檐角悬着长明灯。',
  observatory: '圆顶在缓缓转动，追着头顶的星星。',
  ferris: '十二座吊舱绕中心轴转一整圈，需要几分钟。',
  lighthouse: '灯塔的光束扫过港湾，一圈又一圈。',
  crane: '港口的门式吊，钢梁上留着作业时的橙漆。',
};

class Game {
  private canvas!: HTMLCanvasElement;
  private pipeline!: Pipeline;
  private world!: World;
  private traffic!: Traffic;
  private peds!: Pedestrians;
  private collect!: Collectibles;
  private player!: Player;
  private camera!: ChaseCamera;
  private avatar!: Avatar;
  private input!: Input;
  private hud!: Hud;
  private map!: MapOverlay;
  private audio = new AudioEngine();
  private weather!: Weather;
  private state: AppState = 'boot';
  private time: number = CFG.START_T;
  private simTime = 0;
  private last = 0;
  private seedStr!: string;
  private save!: SaveData;
  private collected = new Set<string>();
  private discovered = new Set<string>();
  private totalShards = 0;
  private challenge: { beaconIdx: number; ringIdx: number; start: number } | null = null;
  private journalOpen = false;
  private prevFlash = 0;
  cinematic = false;

  constructor() {
    this.canvas = document.getElementById('gl') as HTMLCanvasElement;
    const probe = this.canvas.getContext('webgl2');
    if (!probe) {
      document.getElementById('glfail')?.classList.remove('hidden');
      return;
    }
    this.seedStr = (location.hash || '').replace(/^#/, '').slice(0, 24) || randomSeed();
    this.save = loadSave(this.seedStr);

    this.pipeline = new Pipeline(this.canvas);
    this.pipeline.resize(window.innerWidth, window.innerHeight);
    this.pipeline.setPalette((this.save.palette as PaletteId) || 'NEON');
    const cs = CELL_SIZES[Math.min(this.save.cell, CELL_SIZES.length - 1)];
    this.pipeline.setCell(cs.w, cs.h);
    this.pipeline.setBloom(0.85);

    this.world = new World(this.seedStr, this.pipeline);
    this.traffic = new Traffic(this.pipeline.scene, this.pipeline.worldMat, this.pipeline.beamMat, this.seedStr);
    this.peds = new Pedestrians(this.pipeline.scene, this.pipeline.worldMat, this.seedStr);
    {
      const seaSeed = this.world.seed;
      const water = (x: number, z: number) => isSea(Math.floor(x / 72), Math.floor(z / 72), seaSeed);
      this.traffic.isWater = water;
      this.peds.isWater = water;
    }
    this.collect = new Collectibles(this.pipeline.scene, this.pipeline.worldMat);
    this.weather = new Weather(() => Math.random());
    this.camera = new ChaseCamera(this.world);
    this.avatar = new Avatar(this.pipeline.worldMat);
    this.pipeline.addMesh(this.avatar.root);

    // initial chunks around spawn
    const cx = 108, cz = 108;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this.world.update(cx + dx * 30, cz + dz * 30, 100);
      }
    }
    this.world.update(cx, cz, 40);
    const [sx, sy, sz] = this.world.findSpawn();
    this.player = new Player(sx, sy, sz, this.world, this.traffic);
    this.totalShards = this.world.shards.length > 0 ? Math.max(this.world.shardTotalApprox(), this.world.shards.length) : 0;

    this.audio.enabled = this.save.sound;

    this.hud = new Hud();
    this.map = new MapOverlay();
    this.input = new Input(
      () => this.onLockChange(),
      (e, down) => { if (down) this.onKey(e); else if (e.code === 'Tab') e.preventDefault(); },
      (e) => this.input.move(e.movementX, e.movementY),
      () => undefined,
    );
    this.input.attach();
    this.bindUI();
    window.addEventListener('resize', () => this.pipeline.resize(window.innerWidth, window.innerHeight));
    this.applySaveSettings();
  }

  /* ---------------- UI wiring ---------------- */

  private bindUI(): void {
    // clicking the city while playing (e.g. after closing the menu with Esc) re-captures the mouse
    this.canvas.addEventListener('pointerdown', () => {
      if (this.state === 'play' && !this.input.locked) this.input.requestLock(this.canvas);
    });
    const boot = document.getElementById('boot')!;
    boot.addEventListener('pointerdown', () => {
      if (this.state !== 'boot') return;
      this.audio.init();
      this.startPlay();
      this.input.requestLock(this.canvas);
    });
    // boot text
    const lines = [
      ['城市网格', '72 m 街区 · 5×5 区块流式加载'],
      ['天空', '昼夜循环 · 四类天气 · 程序云层'],
      ['交通', '地面车流 · 高架列车（可搭乘）'],
      ['任务', '收集字形 · 信标竞速 · 地标手记'],
      ['操作', 'WASD 移动 · Shift 冲刺 · 空格 跳 · 空中再按空格 飞行 · E 抓钩'],
    ];
    const el = document.getElementById('bootLines')!;
    lines.forEach(([a, b2], i) => {
      window.setTimeout(() => {
        const d = document.createElement('div');
        d.innerHTML = `<b>${a}</b> ${b2}`;
        el.appendChild(d);
      }, 150 + i * 160);
    });
    const loadEl = document.getElementById('bootLoad')!;
    loadEl.textContent = `SEED ${this.seedStr.toUpperCase()} · 城市已生成`;

    // menu
    const menu = document.getElementById('menu')!;
    const mPal = document.getElementById('mPal')!;
    const mCell = document.getElementById('mCell')!;
    const mSound = document.getElementById('mSound')!;
    const mSeed = document.getElementById('mSeed') as HTMLInputElement;
    const refresh = () => {
      mPal.textContent = this.pipeline.palette;
      mCell.textContent = CELL_SIZES[CELL_SIZES.findIndex((c) => c.w === this.pipeline.cellW)]?.label ?? '';
      mSound.textContent = this.audio.enabled ? '开' : '关';
      mSeed.value = this.seedStr;
    };
    this.menuRefresh = refresh;
    menu.querySelectorAll<HTMLElement>('.menu-row').forEach((row) => {
      row.addEventListener('click', () => {
        const act = row.dataset.act;
        if (act === 'resume') this.closeMenu();
        else if (act === 'palette') {
          const i = PALETTES.findIndex((p) => p.id === this.pipeline.palette);
          const next = PALETTES[(i + 1) % PALETTES.length].id;
          this.pipeline.setPalette(next);
          this.save.palette = next;
          writeSave(this.seedStr, this.save);
          refresh();
        } else if (act === 'cell') {
          const i = CELL_SIZES.findIndex((c) => c.w === this.pipeline.cellW);
          const next = CELL_SIZES[(i + 1) % CELL_SIZES.length];
          this.pipeline.setCell(next.w, next.h);
          this.save.cell = (i + 1) % CELL_SIZES.length;
          writeSave(this.seedStr, this.save);
          refresh();
        } else if (act === 'sound') {
          this.toggleSound();
          refresh();
        } else if (act === 'newcity') {
          const s = randomSeed();
          location.hash = s;
          location.reload();
        } else if (act === 'goseed') {
          const s = mSeed.value.trim().slice(0, 24);
          if (!s) return;
          location.hash = s;
          location.reload();
        }
      });
    });
  }
  private menuRefresh: () => void = () => undefined;

  private applySaveSettings(): void {
    for (const id of this.save.landmarks) this.discovered.add(id);
    for (const id of this.save.shards) this.collected.add(id);
  }

  private startPlay(): void {
    this.state = 'play';
    document.getElementById('boot')?.classList.add('hidden');
    this.hud.show();
    this.hud.setHint('WASD 移动 · 空格 跳 · 空中再按空格 飞行 · E 抓钩 · Tab 地图', 6000);
  }

  private openMenu(): void {
    this.state = 'menu';
    this.map.show(false);
    document.getElementById('menu')?.classList.remove('hidden');
    this.menuRefresh();
  }

  private closeMenu(): void {
    this.state = 'play';
    document.getElementById('menu')?.classList.add('hidden');
    // browsers refuse to re-capture the mouse from the Esc key itself; if that happens the next
    // click on the city takes it back
    this.input.requestLock(this.canvas);
    if (!this.input.locked) this.hud.setHint('点击画面继续控制视角', 2500);
  }

  private onLockChange(): void {
    if (this.input.locked) {
      if (this.state === 'menu') this.closeMenu();
    } else if (this.state === 'play') {
      this.openMenu();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.code === 'Tab') e.preventDefault();
    if (e.code === 'Escape') {
      // Esc opens the pause menu (the browser also releases the mouse), Esc again closes it
      if (this.state === 'menu') { this.closeMenu(); return; }
      if (this.state === 'play' && !this.input.locked) { this.openMenu(); return; }
    }
    if (this.state === 'play') {
      if (e.code === 'Tab') {
        const on = this.map.toggle();
        if (on) this.hud.setHint('Tab 关闭地图', 1500);
      } else if (e.code === 'KeyJ') {
        this.journalOpen = !this.journalOpen;
        this.drawJournal();
      } else if (e.code === 'KeyP') {
        this.takePhoto();
      } else if (e.code === 'KeyM') {
        this.toggleSound();
      }
    } else if (this.state === 'menu' && e.code === 'KeyR') {
      this.closeMenu();
    }
  }

  private toggleSound(): void {
    this.audio.setEnabled(!this.audio.enabled);
    this.save.sound = this.audio.enabled;
    writeSave(this.seedStr, this.save);
    this.hud.toast(this.audio.enabled ? '声音已开启' : '声音已关闭');
  }

  private takePhoto(): void {
    this.pipeline.render();
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `glyphropolis-${this.seedStr}-${Math.floor(this.time * 24 * 60).toString().padStart(3, '0')}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
    this.hud.toast('照片已保存');
  }

  private drawJournal(): void {
    const cv = document.getElementById('journal') as HTMLCanvasElement;
    cv.classList.toggle('hidden', !this.journalOpen);
    if (!this.journalOpen) return;
    cv.width = 380;
    cv.height = 80 + LANDMARKS.length * 56;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = 'rgba(4,8,10,0.94)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#35e0b8';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('地 标 手 记', 20, 30);
    ctx.font = '11px monospace';
    let y = 60;
    for (const l of LANDMARKS) {
      const found = this.discovered.has(l.id);
      ctx.fillStyle = found ? '#ffcf6e' : 'rgba(95,143,132,0.8)';
      ctx.fillText(`${found ? '◆' : '◇'} ${found ? l.name : '？？？'}`, 20, y);
      ctx.fillStyle = found ? 'rgba(200,247,232,0.75)' : 'rgba(95,143,132,0.45)';
      ctx.fillText(found ? LM_DESC[l.id] : '尚未抵达此处。', 20, y + 16);
      ctx.fillStyle = 'rgba(95,143,132,0.6)';
      ctx.fillText(`(${l.bx}, ${l.bz})`, 300, y);
      y += 56;
    }
  }

  /* ---------------- main loop ---------------- */

  start(): void {
    this.last = performance.now();
    const tick = (t: number) => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      if (this.state === 'boot') return;
      // the Esc menu really pauses the city; keep drawing so palette / glyph-size changes show
      if (this.state === 'menu') { this.pipeline.render(); return; }
      this.tick(dt, t / 1000);
    };
    requestAnimationFrame(tick);
  }

  private wasFlying = false;
  private flightHints = 0;
  tickCounter = 0;
  lastTickStage = '';

  private stage(s: string): void { this.lastTickStage = s; }

  private tick(dt: number, now: number): void {
    this.tickCounter++;
    this.stage('start');
    try {
      this.tickInner(dt, now);
      this.stage('end');
    } catch (e) {
      this.lastTickStage = 'THROW:' + String(e).slice(0, 200);
    }
  }

  private tickInner(dt: number, now: number): void {
    this.simTime += dt;
    this.time = (this.time + dt / CFG.DAY_SECONDS) % 1;
    this.weather.update(dt);

    const dn = computeDayNight(this.time, this.weather.overcast, this.weather.fog);
    const fogD = 0.000014 + this.weather.fog * 0.00042;
    this.pipeline.setEnv({
      time: this.simTime,
      sunDir: dn.sunDir,
      sunColor: dn.sunColor,
      sunI: dn.sunI,
      ambI: dn.ambI,
      ambColor: dn.ambColor,
      night: dn.night,
      skyTop: dn.skyTop,
      skyHor: dn.skyHorizon,
      starI: dn.starI,
      moonDir: dn.moonDir,
      cloudTint: dn.cloudTint,
      overcast: this.weather.overcast,
      rain: this.weather.rain,
      fogD,
      fogColor: dn.fogColor,
      flash: this.weather.flash,
      windowLit: dn.windowLit,
      lampI: dn.lampI,
      beamI: dn.night,
    });

    if (this.weather.flash > 0.85 && this.prevFlash <= 0.85) this.audio.thunder();
    this.prevFlash = this.weather.flash;

    this.stage('env');
    const p = this.player.state;
    this.world.update(p.pos.x, p.pos.z, 7);
    this.world.animate(dt);
    this.stage('world');

    const camDir = this.player.forward();
    const wasGround = p.onGround;
    this.player.update(dt, this.input, camDir);
    if (this.input.was('Space') && wasGround) this.audio.jump();
    if (p.flying && !this.wasFlying && this.flightHints < 3) {
      this.flightHints++;
      this.hud.setHint('飞行中：W 朝视线方向飞 · 空格/C 升降 · Shift 加速 · F 停止飞行 · 落地自动结束', 5000);
    }
    this.wasFlying = p.flying;
    if (!this.cinematic) this.camera.update(dt, this.player);
    this.avatar.update(dt, p, this.camera.dist, !this.cinematic);

    this.traffic.update(dt, dn.night, this.player.state.pos.x, this.player.state.pos.z);
    this.peds.update(dt, this.simTime, this.weather.rain, this.player.state.pos.x, this.player.state.pos.z);
    const activeBeacon = this.challenge ? this.world.beacons[this.challenge.beaconIdx] ?? null : null;
    this.collect.update(dt, this.simTime, this.world.shards, this.collected, activeBeacon, this.challenge?.ringIdx ?? 0);
    this.stage('entities');

    this.checkShards();
    this.checkLandmarks();
    this.checkBeacons();
    this.updateChallenge(dt, now);

    // HUD
    const hour = Math.floor(this.time * 24);
    const min = Math.floor((this.time * 24 - hour) * 60);
    const district = DISTRICT_NAME[this.world.districtAt(p.pos.x, p.pos.z)] ?? '';
    const weatherName = WEATHER_NAME[this.weather.kind] ?? '晴';
    this.hud.setStatus(`${DAYNAME[Math.floor(hour / 3)]} ${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')} · ${district} · ${weatherName}`);
    this.hud.setShards(`◆ ${this.collected.size} / ${this.totalShards}`);
    this.hud.drawCompass(p.yaw, this.world.landmarks, p.pos.x, p.pos.z);
    this.hud.drawGrapple(p.grappleTarget ? [p.grappleTarget.x, p.grappleTarget.y, p.grappleTarget.z] : null,
      [this.camera.pos.x, this.camera.pos.y, this.camera.pos.z], p.yaw, p.pitch, window.innerWidth, window.innerHeight);
    this.hud.setCrosshair(this.input.locked);
    if (this.challenge) {
      const el = now - this.challenge.start;
      this.hud.setBanner(`信号挑战 ${this.challenge.ringIdx}/5 · ${el.toFixed(1)}s`);
    } else {
      this.hud.setBanner(null);
    }

    this.audio.update(dt, this.weather.rain, this.weather.wind, dn.night, p.flying ? p.vel.length() : p.speed, p.onGround);

    if (this.map.visible) {
      this.map.draw(this.world, p.pos.x, p.pos.z, p.yaw, this.collected, this.challenge?.beaconIdx ?? -1);
    }

    if (!this.cinematic) {
      this.pipeline.setCamera(
        [this.camera.pos.x, this.camera.pos.y, this.camera.pos.z],
        [this.camera.quat.x, this.camera.quat.y, this.camera.quat.z, this.camera.quat.w],
      );
    }
    this.pipeline.shadowFocus = this.cinematic ? null : p.pos;
    this.stage('before-render');
    this.pipeline.render();
    this.input.endFrame();
    this.stage('end');
  }

  /* ---------------- interactions ---------------- */

  private checkShards(): void {
    const p = this.player.state.pos;
    for (const s of this.world.shards) {
      const id = `${s.chunkKey}:${s.idx}`;
      if (this.collected.has(id)) continue;
      if (Math.hypot(s.x - p.x, s.y - (p.y + 0.9), s.z - p.z) < 1.9) {
        this.collected.add(id);
        this.save.shards.push(id);
        writeSave(this.seedStr, this.save);
        this.audio.chime();
        this.hud.toast(`拾取字形 ◆ ${String.fromCharCode(s.glyph)}`);
        if (this.collected.size >= this.totalShards) this.hud.toast('所有字形都已被收集！');
      }
    }
  }

  private checkLandmarks(): void {
    const p = this.player.state.pos;
    for (const l of this.world.landmarks) {
      if (this.discovered.has(l.id)) continue;
      if (Math.hypot(l.x - p.x, l.z - p.z) < 46) {
        this.discovered.add(l.id);
        this.save.landmarks.push(l.id);
        writeSave(this.seedStr, this.save);
        this.audio.chime();
        this.hud.toast(`发现地标：${l.name}`);
        if (this.journalOpen) this.drawJournal();
      }
    }
  }

  private checkBeacons(): void {
    if (this.challenge) return;
    const p = this.player.state.pos;
    this.world.beacons.forEach((b, i) => {
      if (Math.hypot(b.x - p.x, b.z - p.z) < 2.8 && Math.abs(b.y - p.y) < 4) {
        this.challenge = { beaconIdx: i, ringIdx: 0, start: performance.now() / 1000 };
        this.audio.whoosh();
        this.hud.toast('信标激活 — 按顺序穿过所有光环');
      }
    });
  }

  private updateChallenge(dt: number, now: number): void {
    void dt;
    if (!this.challenge) return;
    const b = this.world.beacons[this.challenge.beaconIdx];
    const p = this.player.state.pos;
    if (!b) { this.challenge = null; return; }
    if (Math.hypot(b.x - p.x, b.z - p.z) > 160) {
      this.challenge = null;
      this.hud.toast('信号中断 — 挑战中止');
      return;
    }
    const ring = b.rings[this.challenge.ringIdx];
    if (ring && Math.hypot(ring.x - p.x, ring.y - (p.y + 1), ring.z - p.z) < 3.2) {
      this.challenge.ringIdx++;
      this.audio.whoosh();
      if (this.challenge.ringIdx >= b.rings.length) {
        const ms = (now - this.challenge.start) * 1000;
        const key = `beacon:${this.challenge.beaconIdx}`;
        const prev = this.save.best[key];
        if (prev === undefined || ms < prev) {
          this.save.best[key] = ms;
          writeSave(this.seedStr, this.save);
          this.hud.toast(`挑战完成 ${(ms / 1000).toFixed(1)}s · 新纪录`);
        } else {
          this.hud.toast(`挑战完成 ${(ms / 1000).toFixed(1)}s（最佳 ${(prev / 1000).toFixed(1)}s）`);
        }
        this.challenge = null;
      }
    }
  }
}

function main(): void {
  const game = new Game();
  game.start();
  // debug / screenshot API
  (window as unknown as Record<string, unknown>).__city = {
    seed: () => game['seedStr'],
    start: () => {
      if (game['state'] === 'boot') game['startPlay']();
    },
    time: (t: number) => { game['time'] = t; },
    weather: (k: number) => {
      const w = game['weather'];
      w.kind = k;
      const targets: Record<number, [number, number, number]> = {
        0: [0, 0.12, 0], 1: [0, 0.85, 0], 2: [0.65, 0.5, 0], 3: [1, 0.95, 0], 4: [0, 0.12, 0.85],
      };
      const [rr, oc, fg] = targets[k] ?? [0, 0.12, 0];
      w.rain = rr; w.overcast = oc; w.fog = fg;
    },
    teleport: (x: number, y: number, z: number) => {
      game['player'].state.pos.set(x, y, z);
      game['player'].state.vel.set(0, 0, 0);
    },
    cam: (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
      // fixed camera for screenshots; the player is parked under it so the world streams there
      game['cinematic'] = true;
      game['pipeline'].lookAt(px, py, pz, tx, ty, tz);
      const s = game['player'].state;
      s.pos.set(px, py - 1.6, pz);
      s.vel.set(0, 0, 0);
    },
    free: () => { game['cinematic'] = false; },
    look: (yaw: number, pitch: number) => {
      const s = game['player'].state;
      s.yaw = yaw;
      s.pitch = pitch;
      game['camera'].pos.set(s.pos.x, s.pos.y + 1.6, s.pos.z);
      game['camera'].smoothedInit(s.pos.x + Math.sin(yaw) * 6, Math.max(0.4, s.pos.y + 1.6 - Math.sin(pitch) * 6), s.pos.z + Math.cos(yaw) * 6);
    },
    palette: (id: string) => { game['pipeline'].setPalette(id as PaletteId); },
    debug: (m: number) => { game['pipeline'].debugView(m > 0, m === 2); },
    stats: async () => {
      const p = game['pipeline'];
      p.renderer.info.autoReset = false;
      p.renderer.info.reset();
      await new Promise((r) => setTimeout(r, 120));
      const info = { ...p.renderer.info.render };
      p.renderer.info.autoReset = true;
      return info;
    },
    info: () => {
      const p = game['pipeline'];
      const pos = game['player'].state.pos;
      return {
        grid: [p.gridW, p.gridH], dpr: p.dpr, err: p.lastRenderError, frames: p.renderFrameCount,
        pos: [+pos.x.toFixed(1), +pos.y.toFixed(1), +pos.z.toFixed(1)], seed: game['seedStr'],
        pending: game['world'].pending(pos.x, pos.z), chunks: game['world'].chunks.size,
        yaw: +game['player'].state.yaw.toFixed(2), grappling: game['player'].state.grappling, flying: game['player'].state.flying,
        avatar: {
          vis: game['avatar'].root.visible, inScene: game['avatar'].root.parent === p.scene,
          camDist: +game['camera'].dist.toFixed(2), cine: game['cinematic'],
          cam: game['camera'].pos.toArray().map((v: number) => +v.toFixed(1)),
        },
      };
    },
    meshes: () => {
      const p = game['pipeline'];
      const out: string[] = [];
      for (const ch of p.scene.children) {
        const m = ch as unknown as { geometry?: { boundingSphere: { center: { x: number; y: number; z: number }; radius: number } | null; computeBoundingSphere: () => void; attributes: Record<string, { count: number }> }; visible: boolean; type: string };
        if (!m.geometry) continue;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const bs = m.geometry.boundingSphere!;
        out.push(`${m.type} v=${m.geometry.attributes.position.count} c=(${bs.center.x.toFixed(0)},${bs.center.y.toFixed(0)},${bs.center.z.toFixed(0)}) r=${bs.radius.toFixed(0)}`);
      }
      return out;
    },
    collectAll: () => {
      for (const s of game['world'].shards) game['collected'].add(`${s.chunkKey}:${s.idx}`);
    },
    best: () => game['save'].best,
    profile: () => game['pipeline'].profile(),
    findTower: () => {
      const c = game['world'].colliders.find((c: { x0: number; x1: number; y1: number }) => Math.abs(c.y1 - 14) < 0.01 && Math.abs(c.x1 - c.x0 - 6.8) < 0.01);
      return c ? [(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2] : null;
    },
    findDistrict: (d: number) => {
      const w = game['world'];
      for (let r = 0; r < 40; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        if (w.districtAt(i * 72 + 36, j * 72 + 36) === d) return [i * 72, j * 72];
      }
      return null;
    },
    colliders: (r: number) => {
      const pos = game['player'].state.pos;
      return game['world'].colliders
        .filter((c: { x0: number; x1: number; z0: number; z1: number }) => Math.max(c.x0 - pos.x, pos.x - c.x1, c.z0 - pos.z, pos.z - c.z1) < r)
        .map((c: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }) => [c.x0, c.y0, c.z0, c.x1, c.y1, c.z1].map((v) => +v.toFixed(1)));
    },
  };
}

main();
