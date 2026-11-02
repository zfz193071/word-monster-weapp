export interface RoomTouch { readonly identifier: number; readonly clientX: number }
export function normalizeRoomYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) throw new RangeError('房间角度无效');
  const turn = Math.PI * 2;
  return ((yaw % turn) + turn) % turn;
}

// One finger owns a gesture. A screen-width drag turns half a circle.
export class RoomOrbit {
  private finger: number | undefined;
  private originX = 0;
  private originYaw = 0;
  private dragging = false;
  private currentYaw = 0;
  get yaw(): number { return this.currentYaw; }
  start(touches: readonly RoomTouch[]): void {
    if (this.finger !== undefined || !touches.length || !Number.isFinite(touches[0].clientX)) return;
    this.finger = touches[0].identifier; this.originX = touches[0].clientX;
    this.originYaw = this.currentYaw; this.dragging = false;
  }
  move(touches: readonly RoomTouch[], width: number): boolean {
    const touch = touches.find(item => item.identifier === this.finger);
    if (!touch || !Number.isFinite(touch.clientX) || !Number.isFinite(width) || width <= 0) return false;
    const delta = touch.clientX - this.originX;
    if (!this.dragging && Math.abs(delta) < 6) return false;
    this.dragging = true;
    this.currentYaw = normalizeRoomYaw(this.originYaw + delta / width * Math.PI);
    return true;
  }
  end(changed: readonly RoomTouch[]): void {
    if (changed.some(item => item.identifier === this.finger)) this.cancel();
  }
  cancel(): void { this.finger = undefined; this.dragging = false; }
}
