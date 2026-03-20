/// <reference lib="webworker" />

import { Message } from "app/core/types/messages.types";
import { CategoriserConfig } from "app/core/types/workers.types"
import { FileStorageManager } from "../helpers/FileStorageManager.helper";
import { FileObject } from "app/core/types/variables.types";
import { categoriserFilesNames } from "app/core/constants/files.constant";

let iotBrokerPort: MessagePort; // Conexion con el IoT Broker
let messageIdCounter = 0; // Contador para identificar cada petición
const pendingRequests = new Map<number, (data: any) => void>();

const storage = new FileStorageManager();
const MY_FILES: FileObject[] = [
  {
    name: categoriserFilesNames.fileNameClassified,
    header: ""
  },
  {
    name: categoriserFilesNames.fileNameREST,
    header: ""
  },
  {
    name: categoriserFilesNames.fileNameStatus,
    header: ""
  },
  {
    name: categoriserFilesNames.fileNameExpirations,
    header: ""
  }
];


let config: CategoriserConfig = {
  maxPriority: 1, // Maxima prioridad
  minPriority: 4, // Minima prioridad
  priorityMsgQueues: [],
  priorityExpirationTimeQueue: [],
  baseExpirationTime: [5000, 10000, 20000, 60000], // Tiempo base de expiración en ms
  expirationMsgQueue: [], // Cola de expiración de mensajes
  expirationVerifiction: 1000, // Tiempo de comprobación de expiración de mensajes
  expirationMaxQueueMsg: -1, // Tamaño máximo de la cola de mensajes de expiración, -1 indica sin límite
  numMessages: 1000, // Número de mensajes a solicitar del Broker
  timeToReadIotBroker: 500 // Tiempo para leer del broker
}

let initialTimestamp = Date.now(); // Cuando se inicia el sistema

const writeLog = (fileName: string, message: string, printTimestamp: boolean = true) => {
  storage.write(fileName, initialTimestamp, message, printTimestamp);
};

const initiliazeCategoriser = async () => {
  initialTimestamp = Date.now(); // Cuando se inicia el sistema
  let { minPriority } = config;
  // ToDo: hay que inicializar baseExpirationTime dependiendo del número de colas
  // Incializamos cada cola a una lista vacía y los expiration time
  updateCategoriserStructure(minPriority);
  preprareHeaders(minPriority);
  await storage.init(MY_FILES);
  launch(); // Comienza el ciclo de lectura y categorizacion
}

const preprareHeaders = (minPriority: number) => {
  let txt1 = "";
  let txt2 = "";
  let txt3 = "";
  for (let i = 0; i < minPriority; i++) {

    txt1 += " Remaining Q" + (i + 1) + ";";
    txt2 += " Q" + (i + 1) + ";";
    txt3 += " Q" + (i + 1) + " expired; Q" + (i + 1) + " remaining;";
  }
  MY_FILES[0].header = "Timestamp; Request; Recovered; " + txt2; // Classified
  MY_FILES[1].header = "Timestamp; Requests by Dispatcher; Read by Dispatcher; Read Queue; " + txt1 + " Remaining queue expired"; // REST
  MY_FILES[2].header = "Timestamp; " + txt2 + " Q Expirados"; // Status
  MY_FILES[3].header = "Timestamp; " + txt3 + " Total expired ; Expired queue" + txt2; // Expiration
}

const updateCategoriserStructure = (newMinPriority: number): void => {
  config.minPriority = newMinPriority;

  syncMessageQueues(newMinPriority);
  syncExpirationTimes(newMinPriority);

  console.log(`Estructura actualizada: ${newMinPriority} colas operativas.`);
};

/**
 * Ajusta el tamaño de las colas de mensajes al número de prioridades definido.
 */
const syncMessageQueues = (targetSize: number): void => {
  const currentSize = config.priorityMsgQueues.length;

  if (targetSize > currentSize) {
    // Añadimos nuevas colas vacías si el objetivo es mayor
    const newQueues = Array.from({ length: targetSize - currentSize }, () => []);
    config.priorityMsgQueues.push(...newQueues);
  } else if (targetSize < currentSize) {
    // Recortamos las colas si el objetivo es menor
    config.priorityMsgQueues.length = targetSize;
  }
};

/**
 * Sincroniza los tiempos de expiración basados en el baseExpirationTime.
 */
const syncExpirationTimes = (targetSize: number): void => {
  // let { priorityExpirationTimeQueue, baseExpirationTime } = config;
  // Aseguramos que el array tenga el tamaño exacto
  config.priorityExpirationTimeQueue = config.baseExpirationTime.slice(0, targetSize);

  while (config.priorityExpirationTimeQueue.length < targetSize) {
    const lastExpirationTime = config.priorityExpirationTimeQueue[config.priorityExpirationTimeQueue.length - 1];
    //! En caso de que base expirationTime no tenga suficientes huecos, hacemos lastExpirationTime * 3.
    //* Esto lo hacemos porque si nos fijamos en baseExpirationTime, los valores se incrementan en *2 y al final en *3
    config.priorityExpirationTimeQueue.push(lastExpirationTime * 3); // Valor por defecto
  }
};

const getIotMessages = (): Promise<any> => {
  const { numMessages } = config;

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
  const { maxPriority, minPriority, priorityMsgQueues, numMessages } = config;
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

  let msg = "";
  for (let i = maxPriority; i <= minPriority; i++) {
    msg += totalReadPriorities[i - 1] + ";";
  }

  const msgToWrite = `${numMessages};${messages.length};${msg}`;
  writeLog(categoriserFilesNames.fileNameClassified, msgToWrite, true)
  // logMessage(logFilePathClassified, NUM_MESSAGES + ";" + msgs.length + ";" + msg, true);
  showQueuesStatus();
}

const showQueuesStatus = () => {
  const { priorityMsgQueues, priorityExpirationTimeQueue, expirationMsgQueue } = config;
  console.log("-----------------------------------------------------");
  console.log("Status of priority queues after reading from the IoT broker:");
  let msg = "Expiration: "
  for (let i = 0; i < priorityMsgQueues.length; i++) {
    msg += "P" + (i + 1) + ":" + priorityExpirationTimeQueue[i] + "ms ";
  }
  console.log(msg, priorityExpirationTimeQueue);

  msg = "Size: ";
  let txt = "";
  for (let i = 0; i < priorityMsgQueues.length; i++) {
    msg += "Queue: " + (i + 1) + " : " + priorityMsgQueues[i].length + " ";
    txt += priorityMsgQueues[i].length + ";";
  }
  console.log(msg);
  console.log("expiredQueue ", expirationMsgQueue.length, " msg.");
  console.log("-----------------------------------------------------");
  // "Timestamp; Q1; Q2; Q3; Q4; Expirados"
  writeLog(categoriserFilesNames.fileNameStatus, txt + expirationMsgQueue.length, true)
}

// función que gestiona la expiración de mensajes en la cola de expiración
// Recorremos todas las colas
const expirationMsgQueueHandler = async () => {
  const { priorityMsgQueues, priorityExpirationTimeQueue, expirationMsgQueue, expirationMaxQueueMsg } = config;
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
  writeLog(categoriserFilesNames.fileNameExpirations, reg, true);

  showQueuesStatus();

  // Si en la cola hay más mensajes de los permitidos, eliminamos los más antiguos
  if (expirationMaxQueueMsg > 0 && expirationMsgQueue.length > expirationMaxQueueMsg) {
    expirationMsgQueue.splice(0, expirationMsgQueue.length - expirationMaxQueueMsg)
  }
  // console.log("************ END Checking message expirations ************\n\n");

}



const launch = () => {
  const { timeToReadIotBroker, expirationVerifiction } = config;

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

const downloadCSV = async (name: string) => {
  const fileHandle = await storage.prepareForDownload(name);
  postMessage({
    type: 'DOWNLOAD_FINISHED',
    payload: fileHandle,
    filename: name
  });
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
      initiliazeCategoriser();
      break;

    case 'CONFIGURE':
      console.log('Categoriser Worker: Sistema configurado');

      break;

    case 'DOWNLOAD_ONE_CSV':

      downloadCSV(payload);
      break;
  }
});
