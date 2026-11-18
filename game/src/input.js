// Neon Bay Heat — keyboard and mouse input.
// Keys are read as a held set plus edge-triggered presses (E to enter a car
// fires once per tap, not once per frame). Mouse drag orbits the camera;
// pointer lock, when the player clicks into the game, gives raw deltas.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.deltaX = 0;
    this.deltaY = 0;
    this.dragging = false;
    this.locked = false;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedKeys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this._onMouseDown = (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this._onMouseMove = (e) => {
      if (this.locked) {
        this.deltaX += e.movementX;
        this.deltaY += e.movementY;
        return;
      }
      if (!this.dragging) return;
      this.deltaX += e.clientX - this.lastX;
      this.deltaY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    this._onMouseUp = () => {
      this.dragging = false;
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
    };
    this._onBlur = () => {
      this.keys.clear();
      this.dragging = false;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('blur', this._onBlur);
  }

  held(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.pressedKeys.has(code);
  }

  // Call once per rendered frame, after the game has read the presses.
  endFrame() {
    this.pressedKeys.clear();
  }

  get axisY() {
    // +1 forward (W / Up), -1 back (S / Down).
    let v = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) v += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) v -= 1;
    return v;
  }

  get axisX() {
    // +1 right (D / Right), -1 left (A / Left).
    let v = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) v += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) v -= 1;
    return v;
  }

  get running() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  throttle() {
    return this.axisY;
  }

  steer() {
    return this.axisX;
  }

  mouseDelta() {
    const d = { x: this.deltaX, y: this.deltaY };
    this.deltaX = 0;
    this.deltaY = 0;
    return d;
  }

  requestPointerLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      // Pointer lock is a nicety, not a requirement.
    }
  }

  releasePointerLock() {
    if (this.locked) document.exitPointerLock();
  }
}
