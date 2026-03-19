/// <reference lib="webworker" />

import { templateMsg } from "app/core/constants/message.constant";
import { Message } from "app/core/types/messages.types";
import { timestamp } from "rxjs";
import { FileStorageManager } from "../helpers/FileStorageManager.helper";
import { iotBrokerFilesName } from "app/core/constants/files.constant"

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

const storage = new FileStorageManager();
const MY_FILES = [iotBrokerFilesName.fileNameSummary, iotBrokerFilesName.fileNamePathRest, iotBrokerFilesName.fileNamePathGenerated, iotBrokerFilesName.fileNameMsgGenerated];
// Donde guardamos el archivo en el navegador
let opfsRootDirectory: FileSystemDirectoryHandle;

// Los archivos donde se va a guardar la informacion del IoT Broker
let summaryFile: FileSystemFileHandle;      // Archivo de remesas
let pathRestFile: FileSystemFileHandle; // Archivo de lecturas del Categoriser
let pathGeneratedFile: FileSystemFileHandle;// Archivo de todo lo que se ha generado
let messagesGeneratedFile: FileSystemFileHandle;     // Archivo de los mensajes individuales generados

// Los encargados de escribir en los archivos del OPFS
let summaryWriter: FileSystemSyncAccessHandle;
let pathRestWriter: FileSystemSyncAccessHandle;
let pathGeneratedWriter: FileSystemSyncAccessHandle;
let messagesGeneratedWriter: FileSystemSyncAccessHandle;


const encoder = new TextEncoder();

// Nombre de los archivos del IoT Broker
const fileNameSummary = 'iot_broker_generation.csv';         // se almacena información sobre las remesas generadas
const fileNamePathRest = 'iot_broker_REST.csv';              // se almacena información sobre las peticiones recibidas
const fileNamePathGenerated = 'iot_broker_generated.csv';    // se almacena todo lo que se ha generado
const fileNameMsgGenerated = 'iot_broker_msg_generated.csv'  // se almacena todos los mensajes generados


let msgQueue: Message[] = []; // Cola de mensajes
let countShipment = 0; // Contador de remesas

let isRuning = false;
let genMsgTimeout: any;

//! Variables editables de IoT-Broker
//* Máximo y mínimo de mensajes a generar por remesa
let maxMsg = 1000;
let minMsg = 300;
let iniTimestamp = Date.now();

//* Cada X remesas vamos a alternar entre día y noche, de día se generan más mensajes que de noche
let isDay = true;
let factorNight = 0.2; // Factor para aumentar los mensajes de día
let shipmentChange = 500; // Cada X remesas cambiamos de día a noche o viceversa

//* Límites de colas 
const maxPriority = 1; // Máxima prioridad
let minPriority = 4; // Míninma prioridad
// Distribucion de prioridades entre los mensajes, esto es el porcentaje de mensajes que tendrán cada prioridad
// debe sumar 1.0 y haber tantos como prioridades
let weights = [0.05, 0.15, 0.30, 0.50];
let maxQueueMsg = -1 // Controla el número máximo de mensajes en la cola para depuración, -1 indica sin límite

// Mensajes totales a producir y contador de cuantos lleva hasta ahora
let maxTimeToGenerateMsg = 1000; // Tiempo máximo en ms para generar una nueva remesa de mensajes
let totalMessages = 1000000; // Mensajes totales a producir
let producedMessages = 0; // Contador de cuantos mensajes lleva hasta ahora

// Función para generar una prioridad aleatoria entre min y max (ambos inclusive)
const genPriority = () => {
  const valor = Math.random();

  for (let i = 0; i < weights.length; i++) {
    if (valor <= weights[i])
      return i + 1; // Prioridades van de maxPriority hasta minPriority, 1 a 4
  }

  return weights.length - 1; // En caso de que no se cumpla ninguna condición, devolvemos la mínima prioridad
}

const writeLog = (fileName: string, message: string, printTimestamp: boolean = true) => {
  storage.write(fileName, iniTimestamp,  message, printTimestamp);
};


// Función que genera mensajes de forma aleatoria y los añade a la cola
// Los mensajes se encolan al final de la cola
// Cada mensaje tiene la estructura { remesa: X, id: X-Y, priority: Z }
const genMsg = () => {
  countShipment++;

  console.log('----------- GENERANDO MENSAJES -----------')
  // Si han pasado el número de remesas para hacer el cambio de ciclo
  if (countShipment % shipmentChange === 0) {
    isDay = !isDay;
    // console.log(`----------- CHANGE TO ${isDay ? 'DAY' : 'NIGHT'} -----------`)
  }

  let newGroupMsgs = 0;
  if (producedMessages > totalMessages) newGroupMsgs = 0; // Si hemos superado el máximo, no generamos más
  else {
    // Definimos de forma aleatoria la longitud de la remesa, entre minMsg y maxMsg
    newGroupMsgs = Math.round((Math.random() * (maxMsg - minMsg))) + minMsg;

    // Si es de noche aplicamos la reducción
    if (!isDay) newGroupMsgs = Math.round(newGroupMsgs * factorNight);
  }

  let registerMessages = ``;

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


    registerMessages += timeReg + ";" + countShipment + ";" + uidMsg + ";" + priority + '\n';


    // ToDo: Ver que hacer con la generacion de mensajes con TEMPLATE
    //! PROBLEMA: SE HA DESACTIVADO PORQUE NO SE SABE COMO GESTIONAR LOS PROBLEMAS DE MEMORIA QUE GENERA ESTE ARCHIVO.
    // let msgToRegister = templateMsg.replace(/\*\*TIME\*\*/g, timeReg.toString());
    // msgToRegister = msgToRegister.replace(/\*\*DEV_EUI\*\*/g, priority.toString());
    // msgToRegister = msgToRegister.replace(/\*\*UNIQUE_ID\*\*/g, uidMsg);

    // registerMessages += msgToRegister + '\n';
  }

  // Incrementamos el número de mensajes producidos
  producedMessages += newGroupMsgs;

  // Escribimos en messagesGeneratedFile: "Timestamp; Remesa; ID; Priority"
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

    if (!isRuning) return;
    
    if (type === 'GET_MESSAGES') {
      const numMsgsToExtract = payload?.num || 1000;
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
  };
}

const initializeIotBroker = async () => {
  // Iniciamos el tiempo
  iniTimestamp = Date.now();
  isRuning = true;
  await storage.init(MY_FILES);

  genMsg();
}

const createRoutesFiles = async () => {
  // Configuramos los archivos de escritura
  opfsRootDirectory = await navigator.storage.getDirectory();

  // Creamos los archivos con sus nombres definidos
  summaryFile = await opfsRootDirectory.getFileHandle(fileNameSummary, { create: true });
  pathRestFile = await opfsRootDirectory.getFileHandle(fileNamePathRest, { create: true });
  pathGeneratedFile = await opfsRootDirectory.getFileHandle(fileNamePathGenerated, { create: true });
  messagesGeneratedFile = await opfsRootDirectory.getFileHandle(fileNameMsgGenerated, { create: true });

  
  initializeWriters(true);
}

const initializeWriters = async (resetFiles: boolean) => {
  // Conectamos la escritura
  summaryWriter = await summaryFile.createSyncAccessHandle();
  pathRestWriter = await pathRestFile.createSyncAccessHandle();
  pathGeneratedWriter = await pathGeneratedFile.createSyncAccessHandle();
  messagesGeneratedWriter = await messagesGeneratedFile.createSyncAccessHandle();

  // Reiniciamos los archivos
  if(resetFiles){
    summaryWriter.truncate(0);
    pathRestWriter.truncate(0);
    pathGeneratedWriter.truncate(0);
    messagesGeneratedWriter.truncate(0);
  }

  summaryWriter.flush();
  pathRestWriter.flush();
  pathGeneratedWriter.flush();
  messagesGeneratedWriter.flush();
}

const closeWriters = () => {
  summaryWriter.flush();
  summaryWriter.close();
  
  pathRestWriter.flush();
  pathRestWriter.close();
  
  pathGeneratedWriter.flush();
  pathGeneratedWriter.close();

  messagesGeneratedWriter.flush();
  messagesGeneratedWriter.close();
}

const downloadCSV = async (name: string) => {
  const fileHandle = await storage.prepareForDownload(name);
  postMessage({
    type: 'DOWNLOAD_FINISHED',
    payload: fileHandle, 
    filename: name
  });
}

const togglePlayPause = async (simulationIsRuning: boolean) => {
  isRuning = simulationIsRuning; // El estado se gestiona desde el servicio de simulacion
  if(!isRuning){
    // closeWriters();
    if (genMsgTimeout) clearTimeout(genMsgTimeout);
  }
  else {
    // await initializeWriters(false);
    genMsg();
    
  }
  console.log(`Broker Worker: Sistema ${isRuning ? 'REANUDADO' : 'PAUSADO'}`);
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
      if (genMsgTimeout) clearTimeout(genMsgTimeout);
      closeWriters();
      console.log('Broker Worker: Sistema DETENIDO');
      break;

    case 'PLAY_PAUSE':
      
      togglePlayPause(payload);
      break;

    case 'CONFIGURE':
      console.log('Broker Worker: Sistema CONFIGURADO');

      break;

    case 'DOWNLOAD_ONE_CSV':

      downloadCSV(payload);
      break;

    case 'DOWNLOAD_ALL_CSV':

      break;

  }

});
