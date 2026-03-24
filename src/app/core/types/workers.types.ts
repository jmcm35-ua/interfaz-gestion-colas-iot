import { Message } from "./messages.types";

export interface CategoriserConfig {
    maxPriority: number;
    minPriority: number;
    // Un array que contiene arrays de cualquier cosa (o de tu tipo Mensaje)
    priorityMsgQueues: Message[][];
    priorityExpirationTimeQueue: number[];
    baseExpirationTime: number[];
    expirationMsgQueue: any[];
    expirationVerifiction: number;
    expirationMaxQueueMsg: number;
    numMessages: number;
    timeToReadIotBroker: number;
}

export interface DispatcherConfig {
    maxSortQueue: number
    numMessages: number;
    timeToReadCategoriser: number;
    minPriority: number;
}