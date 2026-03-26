/// <reference lib="webworker" />

import { templateMsg } from "app/core/constants/message.constant";
import { Message } from "app/core/types/messages.types";
import { FileStorageManager } from "../helpers/FileStorageManager.helper";
import { iotBrokerFilesName } from "app/core/constants/files.constant"
import { FileObject } from "app/core/types/variables.types";
import { IoTBrokerConfig } from "app/core/types/workers.types";

/****
 * 
 * iot_broker simula un broker de mensajes IoT, que genera mensajes de forma aleatoria y los almacena en una cola.
 * Cada mensaje tiene una estructura interna con un remesa, id, prioridad y timestamp.
 * 
 * Para leer del broker se usa un canal de comunicacion entre el Categoriser y el IoT Broker
 * el num indica cuantos mensajes se quieren leer de la cola.
 * Si hay menos mensajes en la cola que los solicitados, se devuelven todos los que haya.
 * Los mensajes leidos se eliminan de la cola.
 * 
 * La generación de mensajes es aleatoria, tanto en número de mensajes generados como en el tiempo entre remesas.
 * 
 */

let categoriserPort: MessagePort; // Conexion con el Categoriser

//************************************************
//! VARIABLES PARA EL SISTEMA DE ARCHIVOS (OPFS)
//************************************************

const storageFiles = new FileStorageManager();
const MY_FILES: FileObject[] = [
  {
    name: iotBrokerFilesName.fileNameSummary,
    header: "Timestamp; Shipment; Messages generated in shipment; Queue Classic lenght; Queue New lenght; Next shipment; Total produced"
  },
  {
    name: iotBrokerFilesName.fileNamePathRest,
    header: "Timestamp; Read by categoriser; Remaining in queue"
  },
  {
    name: iotBrokerFilesName.fileNamePathGenerated,
    header: "Timestamp; Read by consumer; Remaining in queue"
  },
  {
    name: iotBrokerFilesName.fileNameMsgGenerated,
    header: ""
  }
]

let msgQueue: Message[] = []; // Cola de mensajes
let countShipment = 0; // Contador de remesas

let isRuning = false;
let genMsgTimeout: any;

//! Variables editables de IoT-Broker
//* Máximo y mínimo de mensajes a generar por remesa

let iniTimestamp = Date.now();

let config: IoTBrokerConfig = {
  maxMsg: 1000,         // Máximo número de mensajes por remesa
  minMsg: 300,          // Mínimo número de mensajes por remesa
  changeDayNight: true, // Define queremos cambiar entre dia y noche
  factorNight: 0.2,     // Factor para aumentar los mensajes de día
  weights: [0.05, 0.2, 0.30, 0.45],
  maxQueueMsg: -1,      // Controla el número máximo de mensajes en la cola para depuración, -1 indica sin límite
  maxTimeToGenerateMsg: 1000,
  totalMessages: 1000000,
}

const shipmentChange = 500;  // Cada X remesas cambiamos de día a noche o viceversa

let producedMessages = 0; // Contador de cuantos mensajes lleva hasta ahora
let isDay = true;        // Define si es de dia

// Función para generar una prioridad aleatoria entre min y max (ambos inclusive)
const genPriority = () => {
  const { weights } = config; // [0.05, 0.2, 0.3, 0.45, etc.]
  const random = Math.random();
  let cumulativeWeight = 0;

  // Para que las probabilidades sean exactas (5%, 20%, 30%, 45%), debemos de ir sumando los pesos para crear escalones
  for (let i = 0; i < weights.length; i++) {
    cumulativeWeight += weights[i]; // Vamos sumando: 0.05, luego 0.25, luego 0.55, luego 1.0

    if (random <= cumulativeWeight) {
      return i + 1;
    }
  }

  return weights.length; // Seguridad por si la suma no da exactamente 1.0 por decimales
}

const writeLog = (fileName: string, message: string, printTimestamp: boolean = true) => {
  storageFiles.write(fileName, iniTimestamp, message, printTimestamp);
};


// Función que genera mensajes de forma aleatoria y los añade a la cola
// Los mensajes se encolan al final de la cola
// Cada mensaje tiene la estructura { remesa: X, id: X-Y, priority: Z }
const genMsg = () => {
  const { totalMessages, maxMsg, minMsg, factorNight, changeDayNight, maxQueueMsg, maxTimeToGenerateMsg } = config;

  countShipment++;

  console.log('----------- GENERANDO MENSAJES -----------')
  // Si han pasado el número de remesas para hacer el cambio de ciclo
  if (changeDayNight && countShipment % shipmentChange === 0) {
    isDay = !isDay;
    // console.log(`----------- CHANGE TO ${isDay ? 'DAY' : 'NIGHT'} -----------`)
  }

  let newGroupMsgs = 0;
  if (producedMessages > totalMessages) newGroupMsgs = 0; // Si hemos superado el máximo, no generamos más
  else {
    // Definimos de forma aleatoria la longitud de la remesa, entre minMsg y maxMsg
    newGroupMsgs = Math.round((Math.random() * (maxMsg - minMsg))) + minMsg;

    // Si es de noche aplicamos la reducción
    if (changeDayNight && !isDay) newGroupMsgs = Math.round(newGroupMsgs * factorNight);
  }

  let registerMessages = ``;
  let registerReducedMessage = '';
  for (let i = 0; i < newGroupMsgs; i++) {
    const priority = genPriority(); // Prioridad con la que nace el mensajes
    const timeReg = Date.now() - iniTimestamp; // Hora en la que se regista
    const uidMsg = countShipment + '-' + i; // Identificador del mensaje

    msgQueue.push({
      shipment: countShipment,
      id: uidMsg,
      priority,
      timestamp: timeReg
    });


    registerReducedMessage += timeReg + ";" + countShipment + ";" + uidMsg + ";" + priority + '\n';


    // ToDo: Ver que hacer con la generacion de mensajes con TEMPLATE
    //! PROBLEMA: SE HA DESACTIVADO PORQUE NO SE SABE COMO GESTIONAR LOS PROBLEMAS DE MEMORIA QUE GENERA ESTE ARCHIVO.
    let msgToRegister = templateMsg.replace(/\*\*TIME\*\*/g, timeReg.toString());
    msgToRegister = msgToRegister.replace(/\*\*DEV_EUI\*\*/g, priority.toString());
    msgToRegister = msgToRegister.replace(/\*\*UNIQUE_ID\*\*/g, uidMsg);

    registerMessages += msgToRegister + '\n';
  }

  // Incrementamos el número de mensajes producidos
  producedMessages += newGroupMsgs;

  // Escribimos en messagesGeneratedFile: "Timestamp; Remesa; ID; Priority"
  writeLog(iotBrokerFilesName.fileNamePathGenerated, registerReducedMessage, false);
  writeLog(iotBrokerFilesName.fileNameMsgGenerated, registerMessages, false);

  // Si en la cola hay más mensajes de los permitidos, eliminamos los más antiguos
  //! Esto no suele hacerse ya que si no se pierden mensajes, pero es útil para depuración
  if (maxQueueMsg > 0 && msgQueue.length > maxQueueMsg) {
    msgQueue.splice(0, msgQueue.length - maxQueueMsg)
  }

  // Se programa el tiempo para que se ejecute la próxima generación de mensajes
  const nextShipment = Math.round(Math.random() * maxTimeToGenerateMsg);

  // Escribimos en summaryFile: "Timestamp; Remesa; Mensajes generado en remesa; Cola Longitud; SiguienteRemesa; Total Producidos"
  const reg = countShipment + ';' + newGroupMsgs + ';' + msgQueue.length + ";" + nextShipment + ";" + producedMessages;
  writeLog(iotBrokerFilesName.fileNameSummary, reg, true);
  if (isRuning) {
    genMsgTimeout = setTimeout(genMsg, nextShipment);
  }
}

const configureCategoriserPort = () => {
  categoriserPort.onmessage = ({ data }) => {
    const { type, messageId, payload } = data;

    console.log({ type, messageId, payload })
    if (!isRuning) return;

    if (type === 'GET_MESSAGES') {
      sendMessages(messageId, payload.num);
    } else {
      console.warn('Incorrect message Type')
    }
  };
}

const sendMessages = (messageId: number, numMsgsToExtract: number = 1000) => {
  console.log({ messageId, numMsgsToExtract })
  // Sacamos los mensajes de la cola interna
  const extracted = msgQueue.splice(0, numMsgsToExtract);

  // Escribimos en pathRestFile: {"Timestamp; Leidos por Classifier; Quedan en cola"}
  const msgToWrite = `${numMsgsToExtract};${msgQueue.length}`;
  writeLog(iotBrokerFilesName.fileNamePathRest, msgToWrite, true)

  console.log('----------- ENVIANDO MENSAJES -----------')

  // Enviamos los mensajes a simulation.service
  categoriserPort.postMessage({
    type: 'MESSAGES_PULLED',
    messageId: messageId,
    payload: {
      messageInfo: 'Pull messages to Consumer',
      messages: extracted,
      queueSize: msgQueue.length // Enviamos el tamaño para debug
    }
  });
}

const initializeIotBroker = async () => {
  // Iniciamos el tiempo
  iniTimestamp = Date.now();
  isRuning = true;
  await storageFiles.init(MY_FILES);

  genMsg();
}

const downloadCSV = async (name: string) => {
  const fileHandle = await storageFiles.prepareForDownload(name);
  postMessage({
    type: 'DOWNLOAD_FINISHED',
    payload: fileHandle,
    filename: name
  });
}

const stopLaunch = (endSimulation: boolean = false) => {
  if (genMsgTimeout) clearTimeout(genMsgTimeout);

  if (endSimulation) storageFiles.closeAll();
}

const togglePlayPause = async (simulationIsRuning: boolean) => {
  isRuning = simulationIsRuning; // El estado se gestiona desde el servicio de simulacion
  if (!isRuning) {
    stopLaunch();

  }
  else {
    // await initializeWriters(false);
    genMsg();

  }
  console.log(`Broker Worker: Sistema ${isRuning ? 'REANUDADO' : 'PAUSADO'}`);
}

const updateConfig = (newConfig: any) => {
  config = { ...config, ...newConfig };

  console.log('Nuevo objeto config:', config);
}
// Controlador de eventos. Escuchamos desde simulation.service
addEventListener('message', (event) => {
  const { type, payload } = event.data;

  switch (type) {

    case 'CONNECT_CHANNEL':
      categoriserPort = event.ports[0];
      configureCategoriserPort();
      break;
    // Inicializamos el sistema
    case 'START':
      console.log('Broker Worker: Sistema iniciado');
      initializeIotBroker();

      break;

    // ToDo: Incluir la funcionalidad para STOP, PAUSE y CONFIGURE
    case 'STOP':
      isRuning = false;
      stopLaunch(true);
      console.log('Broker Worker: Sistema DETENIDO');
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

    case 'DOWNLOAD_ALL_CSV':

      break;

  }

});
