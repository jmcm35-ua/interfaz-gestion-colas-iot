/// <reference lib="webworker" />

import { FileObject } from 'app/core/types/variables.types';
import { DispatcherConfig } from '../../types/workers.types'
import { FileStorageManager } from '../helpers/FileStorageManager.helper';
import { RequestManager } from '../helpers/RequestManager.helper';
import { dispatcherFilesNames } from 'app/core/constants/files.constant';
import { Message } from 'app/core/types/messages.types';
import { Communication } from 'app/core/constants/communication.constant';


let categoriserMessenger: RequestManager;
let consumerPort: MessagePort;

const storageFiles = new FileStorageManager();
const MY_FILES: FileObject[] = [
  {
    name: dispatcherFilesNames.fileNameDispatcher,
    header: ""
  },
  {
    name: dispatcherFilesNames.fileNameREST,
    header: "Timestamp; Orders ; Extracted; Remaining"
  }
];

// Momento en el que se inició la sesión
let iniTimestamp = Date.now();
let totalPausedTime = 0; // Acumula el tiempo que pasamos en pausa
let pauseStartTimestamp = 0;

// Variable que gestiona si está en funcionamiento el worker
let isRuning: boolean = false;

let readAndSortTimeout: any;

// Variables internas del worker
let msgPerPriority: number[] = [];
let sortPriorityQueue: Message[] = [];

// Variables configurables del Worker
let config: DispatcherConfig = {
  maxSortQueue: -1,
  numMessages: 1000,
  timeToReadCategoriser: 1000,
  powerPriority: [1, 0.5, 0.25, 0.125],
  minPriority: 4
}

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

// Esta función calcula la potencia total. Luego la normaliza y extrae la cantidad correspondiente de mensaje de numMessages
const configurePowerPriority = () => {
  const { minPriority, powerPriority } = config;
  let totalPower = 0;
  // powerPriority = [];

  // powerPriority.push(1)
  totalPower += 1;
  for (let i = 1; i < minPriority; i++) {
    // powerPriority.push(powerPriority[i - 1] / 2);
    totalPower += powerPriority[i];
  }
  console.log("Power Priority: ", powerPriority);
  return totalPower;
}

const configureMsgPerPriority = () => {
  const { numMessages, minPriority, powerPriority } = config;

  msgPerPriority = [];

  let rest = numMessages;
  let totalPowerPriority = configurePowerPriority();

  for (let i = 0; i < minPriority - 1; i++) {
    msgPerPriority.push(Math.round((powerPriority[i] / totalPowerPriority) * numMessages));
    rest -= msgPerPriority[i];
  }

  msgPerPriority.push(rest);
  console.log("Messages per Priority: ", msgPerPriority);
}


/****
  * Función que lee de cada cola, en función del power que tiene definido
  * y mete los mensajes en la cola priorizada
  * si lee menos mensajes de los solicitados, acumula a la siguiente cola el número de mensajes
  * y si quedan mensajes, lee de la de expirados
*/
const readAndSort = async () => {
  const { minPriority, maxSortQueue, powerPriority } = config;
  let totalRead = 0;
  let remaining = 0;
  let reg = "";

  let msg = "******************* readAndSort *******************\nRead from Queues: [" + msgPerPriority[0];
  for (let i = 1; i < minPriority; i++) { msg += ',' + msgPerPriority[i] }
  msg += "]";
  // console.clear();
  console.log(msg);
  for (let i = 0; i < minPriority; i++) {
    // leemos mensajes de la cola de prioridad i+1
    //     la estructura devuelta estructura{ 
    //   message: 'Extraer mensajes de la cola prioridad' + priority,
    //   data: 'num: ' + num + ' priority:' + priority,
    //   mensajes: returnMsg,
    //   numMsg: returnMsg.length
    remaining += msgPerPriority[i];
    const data = await getClassifierMessage(remaining, i + 1);
    if (!data) {
      console.error("It has not been possible to read from the Categoriser");
      return;
    }

    // Calculamos si ha sobrado potencia
    const { numMsgExtracted, messagesExtracted } = data;

    reg += (i + 1) + ";" + powerPriority[i] + ";" + msgPerPriority[i] + ";" + remaining + ";" + numMsgExtracted + ";";
    remaining -= numMsgExtracted;
    // Acumulamos el total de mensajes leidos
    totalRead += numMsgExtracted;
    console.log('Read from Categoriser priorityQueue ', i + 1, ':', numMsgExtracted, ' remaining: ', remaining)
    // Metemos los mensajes leidos en la cola ordenada de prioridad
    if (numMsgExtracted > 0) {
      messagesExtracted.forEach((msg: Message) => {
        sortPriorityQueue.push(msg)
      });
    }

    // Limitamos el tamaño de la cola priorizada a maxSortQueu o si -1 ignoramos el límite
    if (maxSortQueue > 0 && sortPriorityQueue.length > maxSortQueue) {
      sortPriorityQueue.splice(0, sortPriorityQueue.length - maxSortQueue)
    }
  }

  // Si han quedado en remaining mensajes por leer, los leemos de la cola de expirados
  let dataExp;
  if (remaining > 0) {
    dataExp = await getClassifierMessage(remaining, 0);

    if (dataExp) {
      const { numMsgExtracted: numMessagesExpired, messagesExtracted: messagesExpired } = dataExp;
      totalRead += numMessagesExpired;
      // Metemos los mensajes leidos en la cola ordenada de prioridad
      if (numMessagesExpired > 0) {
        messagesExpired.forEach((msg: Message) => {
          sortPriorityQueue.push(msg)
        });
      }
      reg += "0;" + remaining + ";" + numMessagesExpired + ";" + (remaining - numMessagesExpired);
      remaining -= numMessagesExpired;
      console.log(`Read ${numMessagesExpired} messages from the Expiration queue. Remaining ${remaining} unread messages.`);

    } else {
      reg += "0;" + remaining + ";0;" + remaining;
    }
  } else {
    reg += "0;" + remaining + ";0;" + remaining;
  }
  writeLog(dispatcherFilesNames.fileNameDispatcher, reg, true);

  console.log("\nTotal messages read and placed in the prioritised queue: ", totalRead);
  console.log("Current size of the prioritised queue: ", sortPriorityQueue.length);
  console.log("******************* END readAndSoft *******************\n\n");
}

const getClassifierMessage = async (numMsgsToExtract: number, priorityMessages: number): Promise<any> => {
  if (!categoriserMessenger) throw new Error('Puerto no conectado');

  // Enviamos y esperamos la respuesta de forma limpia a traves del PortMessenger
  return await categoriserMessenger.request('GET_MESSAGES', {
    numMsgs: numMsgsToExtract,
    priority: priorityMessages
  });
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

  if (Object.keys(newConfig).includes('minPriority')) configureMsgPerPriority()
}

const launch = () => {
  runReadAndSortLoop();
}

const runReadAndSortLoop = async () => {
  if (!isRuning) return; // Condición de parada
  console.log("READINGG")
  await readAndSort();

  // Programamos la siguiente ejecución
  readAndSortTimeout = setTimeout(runReadAndSortLoop, config.timeToReadCategoriser);
}

const initilizeDispatcher = async () => {
  isRuning = true;
  iniTimestamp = Date.now();
  await storageFiles.init(MY_FILES);
  totalPausedTime = 0;
  pauseStartTimestamp = 0;
  configureMsgPerPriority();
  launch();
}

const stopLaunch = (endSimulation: boolean = false) => {
  if (readAndSortTimeout) clearTimeout(readAndSortTimeout);

  if (endSimulation) {
    storageFiles.closeAll();
    // Reiniciamos los valores
    msgPerPriority = [];
    sortPriorityQueue = [];
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
  console.log(`DISPATCHER Worker: Sistema ${isRuning ? 'REANUDADO' : 'PAUSADO'}`);
}

const configureConsumerPort = () => {
  consumerPort.onmessage = ({ data }) => {

    const { type, messageId, payload } = data;

    if (!isRuning) {
      consumerPort.postMessage({
        type: 'MESSAGES_PULLED',
        code: 200,
        payload: { extractedMessages: [] }
      });
      return;
    }

    if (type === 'GET_MESSAGES') {
      sendMessagesToConsumer(messageId, payload);
    } else {
      console.warn('Incorrect message Type')
    }
  };
}

const sendMessagesToConsumer = (messageId: number, payload: any) => {
  const { numMsgs } = payload;

  // desencolo de la cola de mensajes tantos mensajes como dice num
  // extraemos los mensajes del principio de la cola
  const returnMsg = sortPriorityQueue.splice(0, numMsgs);
  console.log("******************* get ***************************");
  console.log('Dequeue', numMsgs, 'queue items. Remaining', sortPriorityQueue.length, 'messages in the queue.');
  console.log("******************* END get ***************************\n\n");

  //"Timestamp; Pedidos ; Extraidos; Quedan"
  const register = numMsgs + ";" + returnMsg.length + ";" + sortPriorityQueue.length;
  writeLog(dispatcherFilesNames.fileNameREST, register, true);

  consumerPort.postMessage({
    type: 'MESSAGES_PULLED',
    messageId: messageId,
    payload: {
      extractedMessages: returnMsg
    }
  });
}

const sendMetrics = (idSimulation: number) => {
  postMessage({
    type: 'METRICS_RESPONSE',
    payload: {
      idSimulation,
      metrics: {
        sortPriorityQueue: sortPriorityQueue.length
      }
    }
  })
};

// Evento para escuchar los MENSAJES que entran al CATEGORISER
addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'CONNECT_CHANNEL':
      const port = event.ports[0];

      if (payload === Communication.receptor) {
        // Inicializamos el messenger con el puerto del Categoriser y le decimos que espere respuestas tipo 'MESSAGES_PULLED'
        categoriserMessenger = new RequestManager(port, 'MESSAGES_PULLED');
      } else {
        // Inicializamos el puerto de comunicacion con el Consumer
        consumerPort = port;
        configureConsumerPort();
      }
      break;

    case 'START':
      console.log('DISPATCHER Worker: Sistema iniciado');
      initilizeDispatcher();
      break;

    case 'PLAY_PAUSE':
      console.log('DETENIDO')
      togglePlayPause(payload);
      break;

    case 'STOP':
      isRuning = false;
      stopLaunch(true);
      console.log('DISPATCHER Worker: Sistema detenido');
      break;

    case 'CONFIGURE':
      console.log('DISPATCHER Worker: Sistema configurado');
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
