/// <reference lib="webworker" />

import { templateMsg } from "app/core/constants/message.constant";
import { Message } from "app/core/types/messages.types";
import { timestamp } from "rxjs";
import { FileStorageManager } from "../helpers/FileStorageManager.helper";
import { consumerFilesNames } from "app/core/constants/files.constant"
import { FileObject } from "app/core/types/variables.types";
import { RequestManager } from "../helpers/RequestManager.helper";
import { ConsumerConfig } from "app/core/types/workers.types";

let dispatcherMessenger: RequestManager; // Conexion con el Dispatcher

const storageFiles = new FileStorageManager();
const MY_FILES: FileObject[] = [
  {
    name: consumerFilesNames.fileNameConsumer,
    header: "Timestamp; Shipment ; ID; Priority; Msg timestamp\n"
  },
  {
    name: consumerFilesNames.fileNameConsumerBatch,
    header: "" // Hay que inicializarlo despues
  }
]

let isRuning = false;
let consumeMessagesTimeout: any;

let iniTimestamp = Date.now();
const readMsgPriority: any = []; // Numero de elementos leidos por prioridad

let config: ConsumerConfig = {
  minPriority: 4,  // minima prioridad
  timeToReadDispatcher: 1000, // Velocidad de lectura
  numMessagesToRead: 1000 // mensajes que del dispatcher se sirven al sistema
}

const writeLog = (fileName: string, message: string, printTimestamp: boolean = true) => {
  storageFiles.write(fileName, iniTimestamp, message, printTimestamp);
};

const preprareHeaders = () => {
  const { minPriority } = config;
  let text = "";
  for (let i = 1; i <= minPriority; i++) {
    text += "Priority" + i + ";";
  }

  writeLog(consumerFilesNames.fileNameConsumerBatch, "Timestamp; " + text + "Total read\n", false);
}

const updatePriorityMessages = () => {
  const targetSize = config.minPriority;
  const currentSize = readMsgPriority.length;

  if (targetSize > currentSize) {
    const newQueues = Array.from({ length: targetSize - currentSize }, () => 0);
    readMsgPriority.push(...newQueues);
  } //! Si se hace más pequeño no deberiamos de eliminar as existentes...

  preprareHeaders();
}

const getDispatcherMessages = async () => {
  if (!dispatcherMessenger) throw new Error('Puerto no conectado');

  const { numMessagesToRead } = config;
  // Enviamos y esperamos la respuesta de forma limpia a traves del PortMessenger
  return await dispatcherMessenger.request('GET_MESSAGES', {
    numMsgs: numMessagesToRead
  });
}

const consumeMessages = async () => {
  const { minPriority } = config;
  const { extractedMessages } = await getDispatcherMessages();


  if (!extractedMessages || extractedMessages.length === 0) {
    console.error('Messages could not be obtained from the dispatcher.');
    return;
  }

  let register = '';
  // Para cada mensaje leido vamos a escribir en el archivo sus datos
  const currentTime = Date.now();
  extractedMessages.forEach((msg: Message) => {
    const { priority, id, shipment, timestamp } = msg;
    readMsgPriority[priority - 1]++; // Incrementamos el contador de la prioridad que le corresponda
    register += `${currentTime - iniTimestamp};${shipment};${id};${priority};${timestamp}\n`;
  });

  writeLog(consumerFilesNames.fileNameConsumer, register, false);

  register = ''; // Reiniciamos el registro

  console.log("Read ", extractedMessages.length, "  IoTBroker messages");
  console.log("Consumer NEW - Read messages by priority: ");

  for (let i = 0; i < minPriority; i++) {
    console.log(`Priority ${i + 1}: ${readMsgPriority[i]} messages.`);
    register += readMsgPriority[i] + ';';
  }

  // console.log(`Total read ${readMsgPriority[minPriority]} messages.`);
  writeLog(consumerFilesNames.fileNameConsumerBatch, register, true);
}

const launch = () => {
  runConsumeMessagesLoop();
}

const runConsumeMessagesLoop = async () => {
  if (!isRuning) return; // Condición de parada

  await consumeMessages();

  // Programamos la siguiente ejecución
  consumeMessagesTimeout = setTimeout(runConsumeMessagesLoop, config.timeToReadDispatcher);
}

const initializeConsumer = async () => {
  // Iniciamos el tiempo
  iniTimestamp = Date.now();
  await storageFiles.init(MY_FILES);
  updatePriorityMessages();
  isRuning = true;
  launch();
}

const downloadCSV = async (name: string) => {
  const fileHandle = await storageFiles.prepareForDownload(name);
  postMessage({
    type: 'DOWNLOAD_FINISHED',
    payload: fileHandle,
    filename: name
  });
}

const togglePlayPause = async (simulationIsRuning: boolean) => {
  isRuning = simulationIsRuning; // El estado se gestiona desde el servicio de simulacion
  if (!isRuning) {
    stopLaunch();
  }
  else {
    launch();

  }
  console.log(`CONSUMER Worker: Sistema ${isRuning ? 'REANUDADO' : 'PAUSADO'}`);
}

const stopLaunch = (endSimulation: boolean = false) => {
  isRuning = false;
  if (consumeMessagesTimeout) clearTimeout(consumeMessagesTimeout);

  if (endSimulation) storageFiles.closeAll();
}

const updateConfig = (newConfig: any) => {
  config = { ...config, ...newConfig };

  if (Object.keys(newConfig).includes('minPriority')) updatePriorityMessages()

  console.log('Nuevo objeto config:', config);
}

// Controlador de eventos. Escuchamos desde simulation.service
addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {

    case 'CONNECT_CHANNEL':
      const port = event.ports[0];
      dispatcherMessenger = new RequestManager(port, 'MESSAGES_PULLED');
      break;

    // Inicializamos el sistema
    case 'START':
      console.log('CONSUMER Worker: Sistema iniciado');
      initializeConsumer();

      break;

    // ToDo: Incluir la funcionalidad para STOP, PAUSE y CONFIGURE
    case 'STOP':
      stopLaunch(true);
      console.log('CONSUMER Worker: Sistema DETENIDO');
      break;

    case 'PLAY_PAUSE':

      togglePlayPause(payload);
      break;

    case 'CONFIGURE':
      updateConfig(payload)

      break;

    case 'DOWNLOAD_ONE_CSV':

      downloadCSV(payload);
      break;
  }
});
