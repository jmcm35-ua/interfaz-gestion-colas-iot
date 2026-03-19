/// <reference lib="webworker" />

import { Message } from "app/core/types/messages.types";

let iotBrokerPort: MessagePort; // Conexion con el IoT Broker
let messageIdCounter = 0; // Contador para identificar cada petición
const pendingRequests = new Map<number, (data: any) => void>();

const maxPriority = 1; // maxima prioridad
const minPriority = 4; // minima prioridad

let priorityMsgQueues: Message[][] = [];
let priorityExpirationTimeQueue: number[] = [];
let baseExpirationTime = [5000, 10000, 20000, 60000]; // tiempo base de expiración en ms
let initialTimestamp = Date.now(); // Cuando se inicia el sistema

// cola de expiración de mensajes
let expirationMsgQueue: Message[] = [];
// Tiempo de comprobación de expiración de mensajes
let expirationVerifiction = 1000;
// Tamaño máximo de la cola de mensajes de expiración, -1 indica sin límite
let expirationMaxQueueMsg = -1;

let numMessages = 1000; // Número de mensajes a solicitar
let timeToReadIotBroker = 500; // Tiempo para leer del broker


const initiliazeCategoriser = (minPriority: number) => {
  initialTimestamp = Date.now(); // Cuando se inicia el sistema

  // ToDo: hay que inicializar baseExpirationTime dependiendo del número de colas

  // Incializamos cada cola a una lista vacía y los expiration time
  for (let i = 0; i < minPriority; i++) {
    if (i < priorityMsgQueues.length) priorityMsgQueues[i] = [];
    else priorityMsgQueues.push([]);

    // tiempo de expiración de cada cola comienza en 5seg * prioridad
    priorityExpirationTimeQueue[i] = baseExpirationTime[i];
  }

  launch(); // Comienza el ciclo de lectura y categorizacion
}

const getIotMessages = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (!iotBrokerPort) {
      return reject('El puerto de comunicación aún no está establecido');
    }

    const idRequest = ++messageIdCounter;

    // Guardamos la función 'resolve' asociada a este ID para llamarla luego y finalizar la ejecucion de la funcion
    pendingRequests.set(idRequest, resolve);

    // Enviamos el mensaje solicitando los mensajes al IoT Broker, incluyendo el ID del mensaje
    iotBrokerPort.postMessage({
      type: 'GET_MESSAGES',
      messageInfo: 'GET messages from the IoT Broker',
      messageId: idRequest,
      numMessages: numMessages
    });
  });
}

// función que lee del broker IoT y clasifica los mensjaes recibidos en las colas de prioridad
const readFromIotBrokerAndClassify = async () => {
  // console.clear();
  // console.log("\n************ Reading from IoT Broker and classifying messages ************");
  const response: any = await getIotMessages();
  if (!response) {
    console.error("Unable to read from the IoT broker");
    return;
  }
  const { messages, messageInfo, queueSize } = response;

  // Si no hay mensajes, salimos
  if (!messages || messages.length === 0) {
    // console.log("There are no new messages on the IoT broker.");
    // console.log("************ END Reading from IoT Broker and classifying messages ************\n\n");

    return;
  }

  // Clasificamos los mensajes en las colas de prioridad
  // estructura del mensaje { shipment: X, id: X-Y, priority: Z , timestamp: T}
  let totalReadPriorities = [];
  for (let i = maxPriority; i <= minPriority; i++) {
    totalReadPriorities[i - 1] = 0;
  }

  // Colocamos cada mensaje en su cola correspondiente
  messages.forEach((msg: Message) => {
    let p = msg.priority;
    if (p > minPriority || p < maxPriority) {
      console.error("Message with invalid priority: ", msg, " min:", minPriority, " max:", maxPriority);
    } else {
      priorityMsgQueues[p - 1].push(msg); //* Guardamos el mensaje en su cola de prioridad
      totalReadPriorities[p - 1]++; //* Aumentamos el contador de mensajes leidos de esa cola de prioridad (esta variable es para representar los datos)
    }
  });
}

// función que gestiona la expiración de mensajes en la cola de expiración
// Recorremos todas las colas
const expirationMsgQueueHandler = async () => {
  // console.log("************ Checking message expirations ************");
  const now = Date.now() - initialTimestamp;
  let expiredCount = 0;
  let totalExpired = 0;
  let reg = "";

  priorityMsgQueues.forEach((msgQueue, index) => {
    expiredCount = 0;

    while (msgQueue.length > 0 && (now - msgQueue[0].timestamp) > priorityExpirationTimeQueue[index]) {
      // extaemos el mensaje expirado y lo añadimos a la cola de expiraciones
      const expiredMsg = msgQueue.shift();
      //console.log(now," Expirado mensaje ", expiredMsg, " tiempo ", now - expiredMsg.timestamp , " la cola prioridad ",i," ahora tiene ", priorityMsgQueues[i].length, " mensajes y expriedQ ",expirationMsgQueue.length);
      expirationMsgQueue.push(expiredMsg as Message);
      expiredCount++;
    }

    totalExpired += expiredCount;
    reg += expiredCount + ";" + msgQueue.length + ";";
    // if (expiredCount > 0) console.log("---> Expired P", index + 1, ":", expiredCount, "(exp.", priorityExpirationTimeQueue[index], " ms.) - expQueue: ", expirationMsgQueue.length, "msg.");
  })
  reg += totalExpired + ";" + expirationMsgQueue.length;
  // logMessage(logFilePathExpirations, reg, true);

  // showQueuesStatus();

  // Si en la cola hay más mensajes de los permitidos, eliminamos los más antiguos
  if (expirationMaxQueueMsg > 0 && expirationMsgQueue.length > expirationMaxQueueMsg) {
    expirationMsgQueue.splice(0, expirationMsgQueue.length - expirationMaxQueueMsg)
  }
  // console.log("************ END Checking message expirations ************\n\n");

}



const launch = () => {
  // Leemos del broker IoT cada cierto tiempo
  setInterval(readFromIotBrokerAndClassify, timeToReadIotBroker);
  // Gestionamos la expiración de mensajes cada cierto tiempo
  setInterval(expirationMsgQueueHandler, expirationVerifiction);
}


// Evento para escuchar los MENSAJES que SALEN del IOT-BROKER
const configureIotBrokerPort = () => {
  iotBrokerPort.onmessage = ({ data }) => {
    const { type, messageId, payload } = data;
    if (type === 'MESSAGES_PULLED') {
      const idResponse = messageId;
      const messageBroker = payload;

      // Buscamos si tenemos una Promesa esperando esta respuesta exacta
      if (pendingRequests.has(idResponse)) {
        const resolvePromese = pendingRequests.get(idResponse)!;
        resolvePromese(messageBroker);
        pendingRequests.delete(idResponse); // Limpiamos la memoria
      }
    }
  }
}

// Evento para escuchar los MENSAJES que entran al CATEGORISER
addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'CONNECT_CHANNEL':
      // Asignamos la conexion con el IoT Broker
      iotBrokerPort = event.ports[0];
      configureIotBrokerPort();

      break;

    case 'START':
      console.log('Categoriser Worker: Sistema iniciado');
      initiliazeCategoriser(4);
      break;

    case 'CONFIGURE':
      console.log('Categoriser Worker: Sistema configurado');

      break;
  }
});
