/**
 * * Esta clase nos sirve para mejorar la comunicacion entre los Workers gracias a las Promesas.
 * * El worker envia un mensaje solicitando un tipo de datos, se crea una promesa que se resuelve cuando el Worker al que se le solicito los datos los envia 
 */
export class RequestManager {
    private messageIdCounter = 0;
    private pendingRequests = new Map<number, (data: any) => void>();

    /**
     * @param {MessagePort} port - El canal de comunicación.
     * @param {string} responseType - El 'type' que el servidor usará para responder.
     */
    constructor(public port: MessagePort, private responseType: string) {
        this.port.onmessage = (event) => {
            const { type, messageId, payload } = event.data;

            // Si el sobre que llega es una respuesta y tenemos al promesa...
            if (type === this.responseType && this.pendingRequests.has(messageId)) {
                const resolve = this.pendingRequests.get(messageId)!;
                resolve(payload); // Entregamos el contenido
                this.pendingRequests.delete(messageId); // Borramos la promesa resuelta
            }
        };
    }

    /**
     * Envía una petición y devuelve una Promesa que se resuelve al recibir la respuesta.
     * @param {string} type - El tipo de petición (ej: 'GET_MESSAGES').
     * @param {any} payload - Datos de la petición.
     */
    public async request(type: string, payload: any): Promise<any> {
        return new Promise((resolve) => {
            const id = ++this.messageIdCounter;
            this.pendingRequests.set(id, resolve);
            this.port.postMessage({ type, messageId: id, payload });
        });
    }
}