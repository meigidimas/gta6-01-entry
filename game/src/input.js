// Neon Bay Heat — keyboard and mouse input.
// One object owns the key state, edge-triggered presses and the mouse
// orbit deltas the camera consumes each frame.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set(); // codes currently held
    this.pressed = new Set(); // codes pressed since the last poll
    this.mouseDX = 0; // accumulated horizontal drag, pixels
    this.mouseDY = 0; // accumulated vertical drag, pixels
    this.dragging = false;
    this.pointerLocked = false;
    this.lastX = 0;
    this.lastY = 0;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.down.add(event.code);
      this.pressed.add(event.code);
      // Keep the page from scrolling on game keys.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.down.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.dragging = false;
    });

    canvas.addEventListener('mousedown', (event) => {
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    });
    window.addEventListener('mousemove', (event) => {
      if (this.pointerLocked) {
        this.mouseDX += event.movementX || 0;
        this.mouseDY += event.movementY || 0;
        return;
      }
      if (!this.dragging) return;
      this.mouseDX += event.clientX - this.lastX;
      this.mouseDY += event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
    });
    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
  }

  // Ask the browser to lock the pointer to the canvas (driving camera).
  // Fails silently when the browser refuses; drag-orbit still works.
  requestPointerLock() {
    try {
      const promise = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    } catch {
      try { this.canvas.requestPointerLock(); } catch { /* drag fallback */ }
    }
  }

  releasePointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) {
    return this.down.has(code);
  }

  // True once per physical press; consumed by the caller.
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Driving / walking axis in [-1, 1]: forward is +1.
  throttleAxis() {
    let value = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) value += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) value -= 1;
    return value;
  }

  // Steering axis in [-1, 1]: right is +1.
  steerAxis() {
    let value = 0;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) value += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) value -= 1;
    return value;
  }

  // Mouse movement since the last call, then zeroed.
  consumeMouseDelta() {
    const delta = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  // Edge presses are single-frame; call once per rendered frame.
  endFrame() {
    this.pressed.clear();
  }
}
