// In-memory lease prevents delayed work and responses crossing an auth transition.
export class SessionBoundary {
  private epoch = 0;
  private enabled = false;
  private readonly controllers = new Set<AbortController>();
  private readonly failures = new Set<() => void>();
  current() {
    return this.epoch;
  }
  isActive() {
    return this.enabled;
  }
  allowWrites() {
    this.enabled = true;
  }
  canWrite(epoch: number | undefined) {
    return this.enabled && epoch === this.epoch;
  }
  invalidate() {
    this.epoch += 1;
    this.enabled = false;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
  track(controller: AbortController) {
    this.controllers.add(controller);
    return () => this.controllers.delete(controller);
  }
  onFailure(listener: () => void) {
    this.failures.add(listener);
    return () => {
      this.failures.delete(listener);
    };
  }
  fail() {
    for (const listener of this.failures) listener();
  }
}
export const sessionBoundary = new SessionBoundary();
