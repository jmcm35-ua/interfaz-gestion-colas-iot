// Interfaz para un mensaje
export interface Message {
    shipment: number,
    id: string,
    priority: number,
    timestamp: number,
    expired?: boolean
}
