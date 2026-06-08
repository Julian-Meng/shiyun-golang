import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useStore } from "../state/store";
import { pullAt, COMMON_K } from "../engine/engineApi";
import { loadPoetPoems } from "../data/load";
import { pickTargets, SIZE_SCALE } from "./picking";
import { spinXZ, unspinXZ, galaxySpin, SPIN_RATE, GALAXY } from "./galaxyParams";

const GRAVITY_R = GALAXY.RADIUS * 1.15; // inside this sphere the camera is "in the galaxy's grip"

const BASE_SPEED = 140; // world units/sec at speed ×1 (slow, galactic feel)

export function FlyControls() {
  const { camera, gl } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const speedMul = useRef(1);
  const drag = useRef({ active: false, lastX: 0, lastY: 0, moved: 0 });
  const ray = useRef(new THREE.Raycaster());
  const lastHover = useRef(0);

  useEffect(() => {
    ray.current.params.Points = { threshold: 80 };
    euler.current.setFromQuaternion(camera.quaternion);
    const el = gl.domElement;
    const st = useStore.getState;

    const ndc = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    };
    // Screen-space pick: only a star whose on-screen glow is bright enough AND directly
    // under the cursor counts. Dim/empty void → null (caller pulls a random poem).
    const tmpV = new THREE.Vector3();
    const screenPick = (cx: number, cy: number) => {
      const pos = pickTargets.positions;
      const sizes = pickTargets.sizes;
      const poets = pickTargets.poets;
      if (!pos || !sizes) return null;
      const r = el.getBoundingClientRect();
      const px = cx - r.left;
      const py = cy - r.top;
      const dpr = gl.getPixelRatio();
      const hidden = st().hidden;
      const cp = camera.position;
      // stored positions are LOCAL; rotate into world by the current galaxy spin so picking
      // stays aligned with the rendered (spinning) stars. Hoist cos/sin OUT of the 29k-poet
      // loop (was a per-poet spinXZ → 29k×2 trig per hover); inline matches galaxyParams.spinXZ.
      const ca = Math.cos(galaxySpin.angle);
      const sa = Math.sin(galaxySpin.angle);
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < poets.length; i++) {
        const p = poets[i];
        if (hidden.has(p.dynasty)) continue;
        const lx = pos[i * 3], y = pos[i * 3 + 1], lz = pos[i * 3 + 2];
        const x = lx * ca + lz * sa;
        const z = -lx * sa + lz * ca;
        const dist = Math.hypot(x - cp.x, y - cp.y, z - cp.z);
        // CSS-px glow radius, matching the shader's gl_PointSize formula
        const apparent = (Math.min(70, Math.max(1.2, (sizes[i] * SIZE_SCALE) / dist)) * 0.5) / dpr;
        if (apparent < 2.2) continue; // too dim to be a deliberate click target
        tmpV.set(x, y, z).project(camera);
        if (tmpV.z > 1) continue; // behind camera
        const sx = (tmpV.x * 0.5 + 0.5) * r.width;
        const sy = (-tmpV.y * 0.5 + 0.5) * r.height;
        const dd = Math.hypot(sx - px, sy - py);
        const tol = Math.max(apparent, 6);
        if (dd <= tol && dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
      return best >= 0 ? poets[best] : null;
    };

    const isTyping = () => {
      const a = document.activeElement;
      return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA");
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) return;
      keys.current[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => (keys.current[e.code] = false);
    const onDown = (e: PointerEvent) => {
      drag.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (drag.current.active) {
        const dx = e.clientX - drag.current.lastX;
        const dy = e.clientY - drag.current.lastY;
        drag.current.lastX = e.clientX;
        drag.current.lastY = e.clientY;
        drag.current.moved += Math.abs(dx) + Math.abs(dy);
        const s = 0.0024;
        euler.current.y -= dx * s;
        euler.current.x -= dy * s;
        const lim = Math.PI / 2 - 0.02;
        euler.current.x = Math.max(-lim, Math.min(lim, euler.current.x));
        camera.quaternion.setFromEuler(euler.current);
        return;
      }
      // hover (throttled)
      const now = performance.now();
      if (now - lastHover.current > 70) {
        lastHover.current = now;
        const p = screenPick(e.clientX, e.clientY);
        const cur = st().hoverPoetId;
        if ((p?.id ?? null) !== cur) st().setHover(p?.id ?? null);
      }
    };
    const onUp = (e: PointerEvent) => {
      const wasClick = drag.current.active && drag.current.moved < 6;
      drag.current.active = false;
      if (!wasClick) return;
      const poet = screenPick(e.clientX, e.clientY);
      if (poet) {
        st().selectPoet(poet);
        loadPoetPoems(poet.id).then((poems) => useStore.getState().setPoetPoems(poet.id, poems));
      } else {
        const v = ndc(e.clientX, e.clientY);
        ray.current.setFromCamera(v, camera);
        const pt = ray.current.ray.origin.clone().addScaledVector(ray.current.ray.direction, 260);
        // store the void point in the LOCAL galaxy frame so the poem is stable as the galaxy
        // turns and the marker drifts with it. NO camera move on a void click (the glide-focus
        // was inaccurate/disorienting) — just light the star where you clicked.
        const [lx, lz] = unspinXZ(pt.x, pt.z);
        const s = st();
        s.selectPoem(
          pullAt(s.form, [lx, pt.y, lz], {
            lushiOnly: s.lushiFilter,
            commonK: s.commonOnly ? COMMON_K : undefined,
          }),
        );
      }
    };
    const onWheel = (e: WheelEvent) => {
      speedMul.current = Math.min(80, Math.max(0.1, speedMul.current * (e.deltaY > 0 ? 0.82 : 1.22)));
      st().setSpeed(speedMul.current);
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  const tmpUp = useRef(new THREE.Vector3(0, 1, 0));
  useFrame((_, dt) => {
    const flyTarget = useStore.getState().flyTarget;
    if (flyTarget) {
      // flyTarget is LOCAL (a poet position / canonical void point) — rotate it into world by
      // the live spin so the camera homes onto the star as the galaxy turns.
      const [fwx, fwz] = spinXZ(flyTarget[0], flyTarget[2]);
      const tv = new THREE.Vector3(fwx, flyTarget[1], fwz);
      // approach from the camera's CURRENT side (no jarring swing): pull back along target→camera
      const back = new THREE.Vector3().subVectors(camera.position, tv);
      if (back.lengthSq() < 1) back.set(0, 0, 1);
      back.normalize();
      const desired = tv.clone().addScaledVector(back, 320).add(new THREE.Vector3(0, 70, 0));
      const k = 1 - Math.pow(0.0015, dt);
      camera.position.lerp(desired, k);
      const m = new THREE.Matrix4().lookAt(camera.position, tv, tmpUp.current);
      camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m), k);
      if (camera.position.distanceTo(desired) < 24) {
        euler.current.setFromQuaternion(camera.quaternion);
        useStore.getState().setFlyTarget(null);
      }
      return;
    }
    // 引力: once inside the galaxy, orbit the camera WITH the spin (same Δ as the galaxy this
    // frame) so the stars hold still on screen — otherwise close-up stars drift tangentially
    // faster than you can click. Outside the sphere you watch it turn from afar.
    if (useStore.getState().gravity) {
      const cp = camera.position;
      if (cp.x * cp.x + cp.y * cp.y + cp.z * cp.z < GRAVITY_R * GRAVITY_R) {
        const dA = SPIN_RATE * dt; // matches advanceSpin(dt) in Galaxy
        const c = Math.cos(dA), s = Math.sin(dA);
        const px = cp.x, pz = cp.z;
        cp.x = px * c + pz * s; // RotY(dA): orbit position about the galaxy axis
        cp.z = -px * s + pz * c;
        euler.current.y += dA; // turn heading by the same amount → view stays galaxy-locked
        camera.quaternion.setFromEuler(euler.current);
      }
    }
    const k = keys.current;
    const v = new THREE.Vector3();
    if (k["KeyW"]) v.z -= 1;
    if (k["KeyS"]) v.z += 1;
    if (k["KeyA"]) v.x -= 1;
    if (k["KeyD"]) v.x += 1;
    if (k["Space"]) v.y += 1;
    if (k["ShiftLeft"] || k["ShiftRight"]) v.y -= 1;
    if (v.lengthSq() > 0) {
      v.normalize().multiplyScalar(BASE_SPEED * speedMul.current * Math.min(dt, 0.05));
      v.applyQuaternion(camera.quaternion);
      camera.position.add(v);
    }
  });

  return null;
}
