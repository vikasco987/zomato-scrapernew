import { EventEmitter } from "events";

class ZomatoEventEmitter extends EventEmitter {}

export const zomatoEvents = new ZomatoEventEmitter();
