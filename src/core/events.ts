/**
 * Domain events are how modules talk without depending on each other's
 * internals. A new module (for example the future Agent Store or Exchange)
 * subscribes to events instead of being wired into existing code.
 */
export interface DomainEvent<T extends string = string, P = unknown> {
  type: T;
  workspaceId: string;
  payload: P;
  at: Date;
}

type Handler = (event: DomainEvent) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Handler[]>();

  on(type: string, handler: Handler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  async publish(event: DomainEvent): Promise<void> {
    for (const h of this.handlers.get(event.type) ?? []) await h(event);
    for (const h of this.handlers.get("*") ?? []) await h(event);
  }
}
