import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { iotBrokerFilesName, categoriserFilesNames, dispatcherFilesNames, consumerFilesNames } from 'app/core/constants/files.constant'
import JSZip from 'jszip'; // Libreria para generar los ZIPs
import { BehaviorSubject } from 'rxjs';
import { Communication } from '../constants/communication.constant';
import { WorkerId, WorkerMap } from '../types/workers.types';

@Injectable({
  providedIn: 'root'
})
export class SimulationService {
  private initializedSubject = new BehaviorSubject<boolean>(false);
  private runingSubject = new BehaviorSubject<boolean>(false);

  public isInitialized$ = this.initializedSubject.asObservable();
  public isRuning$ = this.runingSubject.asObservable();

  private lastPriorityLength = 4;

  // Declaración de los Workers
  private workers: WorkerMap = {} as WorkerMap;

  fileWorkerMap = new Map<string, Worker>(); // Mapeo de los nombres de los archivos que tendra cada worker

  constructor() {
    this.initWorkers();
    this.buildFileWorkerMap();
  }

  private initWorkers() {
    // Declaración explícita para que el bundler (Webpack/Esbuild) los reconozca
    this.workers = {
      iotBroker: new Worker(new URL('./workers/iot-broker.worker', import.meta.url)),
      categoriser: new Worker(new URL('./workers/categoriser.worker', import.meta.url)),
      dispatcher: new Worker(new URL('./workers/dispatcher.worker', import.meta.url)),
      consumer: new Worker(new URL('./workers/consumer.worker', import.meta.url))
    };

    console.log("Workers inicializados correctamente");

    // Establecer canales
    this.createChannel(this.workers.iotBroker, this.workers.categoriser);
    this.createChannel(this.workers.categoriser, this.workers.dispatcher);
    this.createChannel(this.workers.dispatcher, this.workers.consumer);
  }


  private buildFileWorkerMap() {
    // Mapeo de cada fichero con el worker correspondiente
    const mapping: Record<WorkerId, any> = {
      iotBroker: iotBrokerFilesName,
      categoriser: categoriserFilesNames,
      dispatcher: dispatcherFilesNames,
      consumer: consumerFilesNames
    };

    // Generamos el fileWorkerMap con cada fichero y su worker correspondiente
    Object.entries(mapping).forEach(([id, files]) => {
      const worker = this.workers[id as WorkerId];
      Object.values(files).forEach((fileName) => {
        this.fileWorkerMap.set(fileName as string, worker);
      });
    });
  }

  // Pasamos del formato recibido {name: 'changeDayNight', value: 1} al siguiente {changeDayNight: true}
  prepareObjectConfig = (newConfig: any[]) => {
    return newConfig.reduce((acc: any, curr: any) => {
      acc[curr.name] = curr.value;
      return acc;
    }, {} as any);
  }

  stopSimulation = () => {
    // Detenemos los workers
    try {
      this.toggleInitializedSimulation(false);
      this.runingSubject.next(false);

      this.broadcast('STOP')

    } catch (error) {
      this.toggleInitializedSimulation(false);
      console.error('Se ha producido un error al incializar los workers: ' + error);
    }
  }

  configureSimulation = (newConfig: any) => {
    try {
      let changePriorityQueues = false;

      console.log({ newConfig })
      if (newConfig?.iotBroker) {
        //Damos formato al objeto config de IoT-Broker
        const configToSendIotBroker = this.prepareObjectConfig(newConfig.iotBroker);

        if (configToSendIotBroker?.weights && configToSendIotBroker?.weights.length !== this.lastPriorityLength) {
          changePriorityQueues = true;
          this.lastPriorityLength = configToSendIotBroker.weights.length;
        }

        this.getWorker('iotBroker').postMessage({ type: 'CONFIGURE', payload: configToSendIotBroker });
      }

      if (newConfig?.categoriser || changePriorityQueues) {
        //Damos formato al objeto config del Categoriser
        const configToSendCategoriser = newConfig?.categoriser ? this.prepareObjectConfig(newConfig.categoriser) : {};

        if (changePriorityQueues) {
          configToSendCategoriser['minPriority'] = this.lastPriorityLength;
        }

        this.getWorker('categoriser').postMessage({ type: 'CONFIGURE', payload: configToSendCategoriser });
      }

      if (newConfig?.dispatcher || changePriorityQueues) {
        const configToSendDispatcher = newConfig?.dispatcher ? this.prepareObjectConfig(newConfig.dispatcher) : {};

        if (changePriorityQueues) {
          configToSendDispatcher['minPriority'] = this.lastPriorityLength;
        }

        this.getWorker('dispatcher').postMessage({ type: 'CONFIGURE', payload: configToSendDispatcher });
      }

      if (newConfig?.consumer || changePriorityQueues) {
        const configToSendConsumer = newConfig?.consumer ? this.prepareObjectConfig(newConfig.consumer) : {};

        if (changePriorityQueues) {
          configToSendConsumer['minPriority'] = this.lastPriorityLength;
        }

        this.getWorker('consumer').postMessage({ type: 'CONFIGURE', payload: configToSendConsumer });
      }

    } catch (error) {
      console.error('Se ha producido un error al configurar los workers: ' + error);
    }
  }

  async downloadCSV(singleFileName?: string) {
    const isZipMode = !singleFileName;
    const suggestedName = isZipMode ? 'simulation_logs.zip' : singleFileName;

    try {
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: suggestedName,
      });

      const writable = await fileHandle.createWritable();

      if (!isZipMode && singleFileName) {
        const worker = this.fileWorkerMap.get(singleFileName);
        if (!worker) throw new Error(`No worker found for ${singleFileName}`);

        // processWorkerFileResponse ya te devuelve el File (que es un Blob)
        const result = await this.processWorkerFileResponse(worker, singleFileName);

        await writable.write(result.content);

      } else {
        // MODO ALL (ZIP)
        const promises: Promise<{ filename: string, content: Blob }>[] = [];
        this.fileWorkerMap.forEach((worker, filename) => {
          promises.push(this.processWorkerFileResponse(worker, filename));
        });

        const allFiles = await Promise.all(promises);
        const zip = new JSZip();

        allFiles.forEach(file => {
          zip.file(file.filename, file.content);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });

        // Escribimos el ZIP generado en el archivo del usuario
        await writable.write(zipBlob);
      }

      await writable.close();
      console.log('Archivo movido con éxito al disco local');

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Error en la descarga/movimiento:', err);
    }
  }

  /**
   * Esta funcion:
   * - Pide el archivo al worker.
   * - Recibe el FileHandle.
   * - Extrae el File evitando bloquear la RAM.
   */
  private processWorkerFileResponse(worker: Worker, name: string): Promise<{ filename: string, content: Blob }> {
    return new Promise((resolve) => {
      const listener = async (event: MessageEvent) => {
        const { type, payload, filename } = event.data;

        if (type === 'DOWNLOAD_FINISHED' && filename === name) {
          worker.removeEventListener('message', listener);

          // PAYLOAD ahora es un FileSystemFileHandle
          const fileHandle = payload as FileSystemFileHandle;
          console.log({ fileHandle })
          // Extraemos el archivo (esto es un Blob que apunta al disco OPFS)
          // Es muy eficiente y no carga los 2GB en RAM de golpe
          const file = await fileHandle.getFile();
          console.log('ESTAmos descargando', { file })
          resolve({ filename, content: file });
        }
      };

      worker.addEventListener('message', listener);
      worker.postMessage({ type: 'DOWNLOAD_ONE_CSV', payload: name });
    });
  }

  toggleInitializedSimulation = (intialized: boolean) => {
    this.initializedSubject.next(intialized);
  }

  handleStateSimulation = () => {
    if (!this.initializedSubject.value) this.startSimulation();
    else this.togglePlayPause();
  }

  togglePlayPause = () => {
    try {
      this.runingSubject.next(!this.runingSubject.value);
      const isPlaying = this.runingSubject.value;

      this.broadcast('PLAY_PAUSE', isPlaying)

    } catch (error) {
      this.toggleInitializedSimulation(false);
      console.error(`Se ha producido un error al poner en ${this.isRuning$ ? 'PLAY' : 'PAUSE'} la simulacion: ` + error);
    }
  }

  startSimulation = () => {
    // Iniciamos el worker
    try {
      this.toggleInitializedSimulation(true);
      this.runingSubject.next(true);

      this.broadcast('START')

    } catch (error) {
      this.toggleInitializedSimulation(false);
      console.error('Se ha producido un error al incializar los workers: ' + error);
    }
  }

  private getWorker(id: WorkerId): Worker {
    return this.workers[id];
  }

  // Función para crear un canal de comunicación entre los Workers
  private createChannel(firstWorker: Worker, secondWorker: Worker) {
    const channel = new MessageChannel();

    firstWorker.postMessage({ type: 'CONNECT_CHANNEL', payload: Communication.emisor }, [channel.port1]);
    secondWorker.postMessage({ type: 'CONNECT_CHANNEL', payload: Communication.receptor }, [channel.port2]);
    console.log('Service: Canal directo establecido entre Broker y Categoriser.');
  }

  // Función para enviar un mensaje a TODOS los workers
  private broadcast(type: string, payload?: any): void {
    if (!this.workers) return;

    Object.values(this.workers).forEach((worker) => {
      if (worker) {
        worker.postMessage({ type, payload });
      }
    });
  }

  // Función para destruir TODOS los workers
  destroyWorkers() {
    Object.values(this.workers).forEach(worker => worker.terminate());
    this.initializedSubject.next(false);
    this.runingSubject.next(false);
  }
}
