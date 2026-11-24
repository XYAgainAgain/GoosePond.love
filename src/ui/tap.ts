/* Tracks only the first pointer down; slop in px */
export function tapTracker(slop: number) {
  let press: { id: number; x: number; y: number; moved: boolean } | null = null;
  return {
    down(id: number, x: number, y: number) {
      press ??= { id, x, y, moved: false };
    },
    move(id: number, x: number, y: number) {
      if (press?.id === id && Math.hypot(x - press.x, y - press.y) >= slop) press.moved = true;
    },
    up(id: number, x: number, y: number) {
      if (press?.id !== id) return false;
      this.move(id, x, y);
      const tap = !press.moved;
      press = null;
      return tap;
    },
    cancel(id: number) {
      if (press?.id === id) press = null;
    },
  };
}
