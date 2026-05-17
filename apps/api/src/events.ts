import { EventEmitter } from "node:events";

export interface AppEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export class EventHub {
  private readonly emitter = new EventEmitter();

  publish(type: string, data: Record<string, unknown>): AppEvent {
    const event: AppEvent = {
      id: crypto.randomUUID(),
      type,
      data,
      createdAt: new Date().toISOString()
    };
    this.emitter.emit("event", event);
    return event;
  }

  subscribe(listener: (event: AppEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
