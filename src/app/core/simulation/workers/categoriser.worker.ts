/// <reference lib="webworker" />

import { Message } from "app/core/types/messages.types";
import { CategoriserConfig } from "app/core/types/workers.types"
import { FileStorageManager } from "../helpers/FileStorageManager.helper";
import { FileObject } from "app/core/types/variables.types";
import { categoriserFilesNames } from "app/core/constants/files.constant";
import { RequestManager } from "../helpers/RequestManager.helper";
import { Communication } from "app/core/constants/communication.constant";

let iotBrokerMessenger: RequestManager;
let dispatcherPort: MessagePort; // Conexion con el Categoriser

const storageFiles = new FileStorageManager();
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

const maxPriority = 1; // Maxima prioridad

let priorityMsgQueues: Message[][] = [];
let expirationMsgQueue: Message[] = [];

let config: CategoriserConfig = {
  minPriority: 4, // Minima prioridad
  expirationVerifiction: 1000, // Tiempo de comprobación de expiración de mensajes
  expirationMaxQueueMsg: -1, // Tamaño máximo de la cola de mensajes de expiración, -1 indica sin límite
  numMessages: 1000, // Número de mensajes a solicitar del Broker
  timeToReadIotBroker: 500, // Tiempo para leer del broker
  priorityExpirationTimeQueue: [5000, 10000, 20000, 60000]
}

let iniTimestamp = Date.now(); // Cuando se inicia el sistema
let totalPausedTime = 0; // Acumula el tiempo que pasamos en pausa
let pauseStartTimestamp = 0; // Guarda el instante en el que se produce la pausa

let isRuning = false;
let classifyTimeout: any;
let expirationTimeout: any;

let isDebug = false;
const originalLog = console.log;

console.log = (...args: any[]) => {
  // SOLO si el flag interno es true, se ejecuta el log original
  if (isDebug) {
    originalLog.apply(console, args);
  }
};

const writeLog = (fileName: string, message: string, printTimestamp: boolean = true) => {
  const virtualIniTimestamp = iniTimestamp + totalPausedTime;
  storageFiles.write(fileName, virtualIniTimestamp, message, printTimestamp);
};

const getSimulationTime = (): number => {
  if (!isRuning) {
    return pauseStartTimestamp - iniTimestamp - totalPausedTime;
  }
  return Date.now() - iniTimestamp - totalPausedTime;
};

const initiliazeCategoriser = async () => {
  iniTimestamp = Date.now(); // Cuando se inicia el sistema
  totalPausedTime = 0;
  pauseStartTimestamp = 0;

  await storageFiles.init(MY_FILES);
  updateCategoriserStructure();
  isRuning = true;

  launch(); // Comienza el ciclo de lectura y categorizacion
}

const preprareHeaders = () => {
  const { minPriority } = config;
  let txt1 = "";
  let txt2 = "";
  let txt3 = "";
  for (let i = 0; i < minPriority; i++) {

    txt1 += " Remaining Q" + (i + 1) + ";";
    txt2 += " Q" + (i + 1) + ";";
    txt3 += " Q" + (i + 1) + " expired; Q" + (i + 1) + " remaining;";
  }
  writeLog(categoriserFilesNames.fileNameClassified, "Timestamp; Request; Recovered; " + txt2, false);
  writeLog(categoriserFilesNames.fileNameREST, "Timestamp; Requests by Dispatcher; Read by Dispatcher; Read Queue; " + txt1 + " Remaining queue expired", false)
  writeLog(categoriserFilesNames.fileNameStatus, "Timestamp; " + txt2 + " Q Expirados", false);
  writeLog(categoriserFilesNames.fileNameExpirations, "Timestamp; " + txt3 + " Total expired ; Expired queue", false);
}

const updateCategoriserStructure = (): void => {
  const { minPriority } = config;

  syncMessageQueues(minPriority);
  // syncExpirationTimes(minPriority);

  preprareHeaders();

  console.log(`Estructura actualizada: ${minPriority} colas operativas.`);
};

/**
 * Ajusta el tamaño de las colas de mensajes al número de prioridades definido.
 */
const syncMessageQueues = (targetSize: number): void => {
  const currentSize = priorityMsgQueues.length;

  if (targetSize > currentSize) {
    // Añadimos nuevas colas vacías si el objetivo es mayor
    const newQueues = Array.from({ length: targetSize - currentSize }, () => []);
    priorityMsgQueues.push(...newQueues);
  } else if (targetSize < currentSize) {
    // Recortamos las colas si el objetivo es menor
    priorityMsgQueues.length = targetSize;
  }
};

/*
  * Sincroniza los tiempos de expiración basados en el baseExpirationTime.
*/
const getIotMessages = async (): Promise<any> => {
  if (!iotBrokerMessenger) throw new Error('Puerto no conectado');
  console.log(config.numMessages)
  // Enviamos y esperamos la respuesta de forma limpia a traves del PortMessenger
  return await iotBrokerMessenger.request('GET_MESSAGES', {
    num: config.numMessages
  });
}

// Función que lee del broker IoT y clasifica los mensjaes recibidos en las colas de prioridad
const readFromIotBrokerAndClassify = async () => {
  const { minPriority, numMessages } = config;
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
    console.log("There are no new messages on the IoT broker.");
    console.log("************ END Reading from IoT Broker and classifying messages ************\n\n");

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
  const { priorityExpirationTimeQueue } = config;

  console.log("-----------------------------------------------------");
  console.log("Status of priority queues after reading from the IoT broker:");
  let msg = "Expiration: "
  for (let i = 0; i < priorityMsgQueues.length; i++) {
    msg += "P" + (i + 1) + ":" + priorityExpirationTimeQueue[i] + "ms ";
  }

  msg = "Size: ";
  let txt = "";
  for (let i = 0; i < priorityMsgQueues.length; i++) {
    msg += "Queue: " + (i + 1) + " : " + priorityMsgQueues[i].length + " ";
    txt += priorityMsgQueues[i].length + ";";
  }
  console.log("expiredQueue ", expirationMsgQueue.length, " msg.");
  // "Timestamp; Q1; Q2; Q3; Q4; Expirados"
  writeLog(categoriserFilesNames.fileNameStatus, txt + expirationMsgQueue.length, true)
}

// Función que gestiona la expiración de mensajes en la cola de expiración
// Recorremos todas las colas
const expirationMsgQueueHandler = async () => {
  const { expirationMaxQueueMsg, priorityExpirationTimeQueue } = config;
  console.log("************ Checking message expirations ************");
  const now = getSimulationTime();
  let expiredCount = 0;
  let totalExpired = 0;
  let reg = "";

  priorityMsgQueues.forEach((msgQueue, index) => {
    expiredCount = 0;

    while (msgQueue.length > 0 && (now - msgQueue[0].timestamp) > priorityExpirationTimeQueue[index]) {
      // Extraemos el mensaje expirado y lo añadimos a la cola de expiraciones
      const expiredMsg: Message | undefined = msgQueue.shift();
      if (expiredMsg === undefined) continue;

      expiredMsg.expired = true; // Se agrega para saber cuantos han caducado
      expirationMsgQueue.push(expiredMsg as Message);
      expiredCount++;
    }

    totalExpired += expiredCount;
    reg += expiredCount + ";" + msgQueue.length + ";";
  })
  reg += totalExpired + ";" + expirationMsgQueue.length;
  writeLog(categoriserFilesNames.fileNameExpirations, reg, true);

  showQueuesStatus();

  // Si en la cola hay más mensajes de los permitidos, eliminamos los más antiguos
  if (expirationMaxQueueMsg > 0 && expirationMsgQueue.length > expirationMaxQueueMsg) {
    expirationMsgQueue.splice(0, expirationMsgQueue.length - expirationMaxQueueMsg)
  }
  console.log("************ END Checking message expirations ************\n\n");
}

const sendMessagesToDispatcher = (messageId: number, payload: any) => {
  const { minPriority } = config;
  const { numMsgs, priority } = payload;

  // Si la prioridad indicada no es válida, devolvemos error
  // if (priority < 0 || priority > minPriority) {
  // return res.status(400).json({ errors: [{ msg: 'priority It must be a number between 0 and ' + minPriority + '.' }] });
  // }

  // Desencolo de la cola de prioridad de mensajes tantos mensajes como dice num
  // Extraemos los mensajes del principio de la cola, los más antiguos
  let returnMsg: any = [];
  let msgRes = "";
  if (priorityMsgQueues || expirationMsgQueue) {
    if (priority > 0) {
      returnMsg = priorityMsgQueues[priority - 1].splice(0, numMsgs);
      console.log('Dequeue', numMsgs, 'items from Q', priority, '. Remaining ', priorityMsgQueues[priority - 1].length, ' messages in the queue.');
      msgRes = "Extract from Q" + priority;
    } else {
      // prioridad 0 indica la cola de expiración
      returnMsg = expirationMsgQueue.splice(0, numMsgs);
      console.log('Dequeue', numMsgs, 'items from EXPIRATION queue. Remainingn ', expirationMsgQueue.length, ' queue items.');
      msgRes = "Extract from EXPIRATION";
    }

  }

  //""Timestamp; Pedidos por  Dispatcher; Leidos por Dispatcher; Cola Leida; Quedan Cola P1; Quedan Cola P2; Quedan Cola P3; Quedan Cola P4, Quedan Cola Expirados""
  let msg = "";
  for (let i = maxPriority; i <= minPriority; i++) {
    msg += "Remaining Q " + priorityMsgQueues[i - 1].length + ";";
  }

  writeLog(categoriserFilesNames.fileNameREST, numMsgs + ";" + returnMsg.length + ";" + priority + ";" + msg + expirationMsgQueue.length, true)

  dispatcherPort.postMessage({
    type: 'MESSAGES_PULLED',
    code: 200,
    messageId: messageId,
    payload: {
      messageInfo: 'Pull messages to Dispatcher',
      message: msgRes,
      data: 'num: ' + numMsgs + ' priority:' + priority,
      messagesExtracted: returnMsg,
      numMsgExtracted: returnMsg.length
    }
  });
}

const launch = () => {
  if (!isRuning) return; // Si no está en marcha, no hacemos nada

  // Iniciamos los bucles recursivos
  runClassificationLoop();
  runExpirationLoop();
}

const runClassificationLoop = async () => {
  if (!isRuning) return; // Condición de parada

  await readFromIotBrokerAndClassify();

  // Programamos la siguiente ejecución
  classifyTimeout = setTimeout(runClassificationLoop, config.timeToReadIotBroker);
}

const runExpirationLoop = async () => {
  if (!isRuning) return; // Condición de parada

  await expirationMsgQueueHandler();

  // Programamos la siguiente ejecución
  expirationTimeout = setTimeout(runExpirationLoop, config.expirationVerifiction);
}

const configureDispatcherPort = () => {
  dispatcherPort.onmessage = ({ data }) => {

    const { type, messageId, payload } = data;

    if (!isRuning) {
      dispatcherPort.postMessage({
        type: 'MESSAGES_PULLED',
        code: 200,
        messageId: messageId,
        payload: { numMsgExtracted: 0, messagesExtracted: [] }
      });
      return;
    }

    if (type === 'GET_MESSAGES') {
      sendMessagesToDispatcher(messageId, payload);
    } else {
      console.warn('Incorrect message Type')
    }
  };
}


const downloadCSV = async (name: string) => {
  const fileHandle = await storageFiles.prepareForDownload(name);
  postMessage({
    type: 'DOWNLOAD_FINISHED',
    payload: fileHandle,
    filename: name
  });
}

const updateConfig = (newConfig: any) => {
  config = { ...config, ...newConfig };

  if (Object.keys(newConfig).includes('minPriority')) updateCategoriserStructure()
}

const stopLaunch = (endSimulation: boolean = false) => {
  if (classifyTimeout) clearTimeout(classifyTimeout);
  if (expirationTimeout) clearTimeout(expirationTimeout);

  if (endSimulation) {
    storageFiles.closeAll();

    // Se reinician los datos
    priorityMsgQueues = [];
    expirationMsgQueue = [];
  }
}

const togglePlayPause = async (simulationIsRuning: boolean) => {
  const wasRuning = isRuning;
  isRuning = simulationIsRuning;

  if (!isRuning && wasRuning) {
    pauseStartTimestamp = Date.now();
    stopLaunch();
  }
  else if (isRuning && !wasRuning) {
    totalPausedTime += Date.now() - pauseStartTimestamp;
    launch();
  }
  console.log(`CATEGORISER Worker: Sistema ${isRuning ? 'REANUDADO' : 'PAUSADO'}`);
}

const sendMetrics = (idSimulation: number) => {
  postMessage({
    type: 'METRICS_RESPONSE',
    payload: {
      idSimulation,
      metrics: {
        queuesLength: priorityMsgQueues.map(q => q.length),
        expirationQueue: expirationMsgQueue.length,
      }
    }
  })
}

// Evento para escuchar los MENSAJES que entran al CATEGORISER
addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'CONNECT_CHANNEL':
      const port = event.ports[0];
      if (payload === Communication.receptor) {
        // Inicializamos el messenger con el puerto del IoT-Broker y le decimos que espere respuestas tipo 'MESSAGES_PULLED'
        iotBrokerMessenger = new RequestManager(port, 'MESSAGES_PULLED');
      } else {

        // Inicializamos el puerto de comunicacion con el Dispatcher
        dispatcherPort = port;
        configureDispatcherPort();
      }

      break;

    case 'START':
      console.log('Categoriser Worker: Sistema iniciado');
      initiliazeCategoriser();
      break;

    case 'PLAY_PAUSE':
      console.log('DETENIDO')
      togglePlayPause(payload);
      break;

    case 'STOP':
      isRuning = false;
      stopLaunch(true);
      console.log('Categoriser Worker: Sistema DETENIDO');

      break;

    case 'CONFIGURE':
      console.log('Categoriser Worker: Sistema configurado');
      updateConfig(payload)
      break;

    case 'DOWNLOAD_ONE_CSV':
      downloadCSV(payload);
      break;

    case 'GET_METRICS':
      sendMetrics(payload);
      break;
  }
});
