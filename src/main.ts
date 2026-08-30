import "./style.css";
import { CAMERA, CITY, PLAYER, SHUTTLE, seedFromURL } from "./config";
import { hashString } from "./core/rng";
import { Input } from "./core/input";
import { buildScene } from "./render/scene";
import { makeGroundMaterial, makeSkyMaterial, U } from "./render/materials";
import { Textmode } from "./render/textmode";
import { DayNight } from "./render/daynight";
import { World } from "./world/world";
import { districtAt } from "./world/citygen";
import { Traffic } from "./entities/traffic";
import { Weather } from "./entities/weather";
import { Player } from "./player/player";
import { runBoot } from "./ui/boot";
import { Bloom } from "./ui/bloom";
import { Hud } from "./ui/hud";

addEventListener("error", (e) => fatal("RUNTIME: " + e.message));
addEventListener("unhandledrejection", (e) => fatal("REJECTION: " + String(e.reason)));

function fatal(msg: string) {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:auto 0 40% 0;text-align:center;color:#ff5a7a;font:13px monospace;z-index:99;white-space:pre-wrap;padding:0 20px";
  el.textContent = msg;
  document.body.appendChild(el);
}

async function main() {
  try {
  const seed = seedFromURL();
  const seedNum = hashString(seed);
  const params = new URLSearchParams(location.search);
  const fast = params.has("fast");
  const hourParam = parseFloat(params.get("hour") || "");
  const crtStart = params.has("crt");
  const gl = document.getElementById("gl") as HTMLCanvasElement;
  const bootC = document.getElementById("boot") as HTMLCanvasElement;
  const hudEl = document.getElementById("hud") as HTMLDivElement;

  const groundMat = makeGroundMaterial();
  const skyMat = makeSkyMaterial();
  const { renderer, scene, camera, ground, sky } = buildScene(gl, groundMat, skyMat);
  const world = new World(scene, seedNum);
  const traffic = new Traffic(scene, seedNum);
  const weather = new Weather(scene, seedNum);
  const tm = new Textmode();
  const dn = new DayNight();
  if (!Number.isNaN(hourParam)) dn.hour = ((hourParam % 24) + 24) % 24;
  const input = new Input(gl);
  const bloom = new Bloom();
  const hud = new Hud(hudEl);
  hud.dbgOn = params.has("phys");

  // Spawn on the west sidewalk of a north-south road, facing ALONG it
  // (whichever end holds downtown). ?at=park starts inside the nearest park.
  let sx = 7.2, sz = 14;
  if (params.get("at") === "park") {
    const P0 = CITY.blockPitch;
    outer: for (let r = 0; r < 10; r++) {
      for (let cx = -r; cx <= r; cx++) for (let cz = -r; cz <= r; cz++) {
        if (Math.max(Math.abs(cx), Math.abs(cz)) !== r) continue;
        if (districtAt(seedNum, cx * P0 + 26, cz * P0 + 26) === "park") {
          sx = cx * P0 + 26; sz = cz * P0 + 26;
          break outer;
        }
      }
    }
  }
  const dirs: [number, number, number][] = [[0, -1, 0], [0, 1, Math.PI]];
  let yaw = 0, best = -1;
  for (const [dx, dz, y] of dirs) {
    const d = districtAt(seedNum, sx + dx * 300, sz + dz * 300);
    const score = d === "downtown" ? 2 : d === "midtown" ? 1 : 0;
    if (score > best) { best = score; yaw = y; }
  }
  const player = new Player(yaw, 0);
  player.x = sx; player.z = sz;
  input.yaw = yaw;
  // debug: ?shuttle=<alt> spawns already gliding (rail + HUD verification)
  const shuttleAlt = parseFloat(params.get("shuttle") || "");
  if (!Number.isNaN(shuttleAlt)) { player.mode = "shuttle"; player.y = PLAYER.eye + Math.max(3, shuttleAlt); }

  let crtTarget = crtStart ? 1 : 0;
  // debug: ?at=roof drops the player onto the nearest usable rooftop
  let roofPlaced = params.get("at") !== "roof";
  tm.u.uCrt.value = crtTarget;
  input.onKey = (code) => {
    if (code === "KeyC") crtTarget = crtTarget ? 0 : 1;
    if (code === "KeyR") {
      location.href = location.pathname + "?seed=" +
        Math.random().toString(36).slice(2, 10).toUpperCase();
    }
    if (code === "KeyH") hud.toggleHelp();
  };

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    // The textmode grid is computed in device pixels (w*dpr); the WebGL
    // backing store must match or every cell, the atlas and the Bloom
    // center land in the wrong place on HiDPI displays.
    renderer.setPixelRatio(dpr);
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.domElement.style.width = innerWidth + "px";
    renderer.domElement.style.height = innerHeight + "px";
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    tm.resize(innerWidth, innerHeight, dpr);
  };
  addEventListener("resize", resize);
  resize();

  // Boot plays while the spawn area pregenerates behind it.
  let bootDone = false;
  const bootP = runBoot(bootC, seed, fast);
  const pregen = () => {
    if (bootDone) return;
    world.update(player.x, player.z, fast ? 40 : 10);
    requestAnimationFrame(pregen);
  };
  bootP.then(() => {
    bootDone = true;
    bootC.hidden = true;
    bloom.start(tm.gridW, tm.gridH, tm, fast);
    const wv = parseFloat(params.get("wave") || "");
    if (!Number.isNaN(wv)) bloom.freezeAt(wv);
  });
  requestAnimationFrame(pregen);

  let last = performance.now();
  let frames = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    U.uTime.value = now / 1000;

    dn.update(dt);
    U.uSunDir.value.copy(dn.sunDir);
    U.uSunColor.value.copy(dn.sunColor);
    U.uSunI.value = dn.sunI;
    U.uAmbient.value = dn.amb;
    U.uFogColor.value.copy(dn.horizon);
    U.uSkyTop.value.copy(dn.top);
    U.uSkyHorizon.value.copy(dn.horizon);
    U.uStars.value = dn.stars;
    tm.u.uStars.value = dn.stars;
    U.uExposure.value = 1.72 - dn.amb * 0.7;

    weather.update(dt, dn, camera.position);
    world.update(player.x, player.z, CITY.genBudgetPerFrameMs);
    traffic.update(dt, player.x, player.z);

    if (bloom.controlUnlocked) {
      if (!roofPlaced) {
        const spot = world.findRoofNear(player.x, player.z, 90);
        if (spot) {
          player.x = spot.x; player.z = spot.z;
          player.y = spot.top + PLAYER.eye;
          player.mode = "walk"; player.velX = 0; player.velZ = 0;
          roofPlaced = true;
        }
      }
      player.update(dt, input, camera, world, traffic.obstaclesNear(player.x, player.z));
    } else {
      camera.position.set(player.x, player.y, player.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = input.yaw;
      camera.rotation.x = input.pitch;
    }

    const P = CITY.blockPitch;
    // shuttle speed stretches the fov a touch (52 -> 58)
    const spd3 = Math.hypot(player.velX, player.velZ, player.velY * 0.6);
    const tf = CAMERA.fovY + Math.min(spd3 / SHUTTLE.capHBoost, 1) * 6;
    if (Math.abs(camera.fov - tf) > 0.05) {
      camera.fov += (tf - camera.fov) * Math.min(1, dt * 6);
      camera.updateProjectionMatrix();
    }
    ground.position.set(Math.round(player.x / P) * P, 0, Math.round(player.z / P) * P);
    sky.position.copy(camera.position);

    tm.u.uCrt.value += (crtTarget - tm.u.uCrt.value) * Math.min(1, dt * 8);

    bloom.update(dt, tm, world, player.x, player.z);
    if (bloom.done) hudEl.hidden = false;
    hud.update(dt, {
      seed, hour: dn.hour, state: weather.state,
      crt: tm.u.uCrt.value > 0.5, player, world,
    });

    tm.render(renderer, scene, camera);

    if (++frames === 30) {
      const progs = (renderer.info.programs || []) as { diagnostics?: unknown; name?: string }[];
      const bad = progs.filter((p) => p.diagnostics);
      if (bad.length) {
        fatal("SHADER DIAG:\n" + bad.map((p) => JSON.stringify(p.diagnostics)).join("\n---\n").slice(0, 1200));
      }
    }
  };
  requestAnimationFrame(loop);
  } catch (err) {
    fatal("GLYPHROPOLIS failed to start:\n" + (err instanceof Error ? err.message : String(err)) +
      "\n\nWebGL2 is required.");
    console.error(err);
  }
}

main();
