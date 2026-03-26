import { Message } from "./messages.types";


export interface IoTBrokerConfig {
    maxMsg: number;
    minMsg: number;
    changeDayNight: boolean;
    factorNight: number;
    maxTimeToGenerateMsg: number;
    maxQueueMsg: number;
    weights: number[];
    totalMessages: number;
    // shipmentChange: number;
}

export interface CategoriserConfig {
    minPriority: number;
    // Un array que contiene arrays de cualquier cosa (o de tu tipo Mensaje)
    expirationVerifiction: number;
    expirationMaxQueueMsg: number;
    numMessages: number;
    timeToReadIotBroker: number;
}

export interface DispatcherConfig {
    maxSortQueue: number;
    numMessages: number;
    timeToReadCategoriser: number;
    minPriority: number;
}

export interface ConsumerConfig {
    minPriority: number;
    timeToReadDispatcher: number;
    numMessagesToRead: number;
}
