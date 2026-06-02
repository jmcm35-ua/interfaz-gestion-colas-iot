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

// Identificador del worker en el simulador
export type WorkerId = 'iotBroker' | 'categoriser' | 'dispatcher' | 'consumer';

// Interfaz para que el objeto workers sepa qué contiene
export type WorkerMap = Record<WorkerId, Worker>;

// Interfaz para las métricas
export interface WorkerMetricsSnapshot {
    timestamp: number;          // Tiempo transcurrido de simulación (ms) desde iniTimestamp
    iotBroker: {
        queueSize: number;        // Mensajes acumulados sin clasificar en el Broker
        totalProduced: number;    // Acumulado histórico de mensajes creados
        generatedMessages: { time: number, total: number }[]; // Guardamos el tiempo para hacer correctamente el gráfico de dispersion
    };
    categoriser: {
        queuesLength: any[];   // Array con la longitud actual de cada cola [Q1, Q2, Q3, Q4]
        expirationQueue: number;  // Mensajes en la cola de expirados
    };
    dispatcher: {
        sortPriorityQueue: number;  // Tamaño actual de la cola ordenada y priorizada
    };
    consumer: {
        readByPriority: number[]; // Histórico de mensajes procesados por prioridad [P1, P2, P3, P4]
        timePerPriority: number[];
        messagesExpired: number[];
    };
}