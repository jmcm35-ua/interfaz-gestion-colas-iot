import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { iotBrokerFilesName, categoriserFilesNames, dispatcherFilesNames, consumerFilesNames } from 'app/core/constants/files.constant'
import JSZip from 'jszip'; // Libreria para generar los ZIPs
import { BehaviorSubject } from 'rxjs';

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
  private iotBrokerWorker!: Worker;
  private categoriserWorker!: Worker;
  private dispatcherWorker!: Worker;
  private consumerWorker!: Worker;

  fileWorkerMap = new Map<string, Worker>(); // Mapeo de los nombres de los archivos que tendra cada worker

  constructor() {
    this.initWorkers();
    this.buildFileWorkerMap();
  }
  private buildFileWorkerMap() {
    // Mapeo de cada fichero con el worker correspondiente
    const workerConfigs = [
      { files: iotBrokerFilesName, worker: this.iotBrokerWorker },
      { files: categoriserFilesNames, worker: this.categoriserWorker },
      { files: dispatcherFilesNames, worker: this.dispatcherWorker },
      { files: consumerFilesNames, worker: this.consumerWorker }
    ];

    // Generamos el fileWorkerMap con cada fichero y su worker correspondiente
    workerConfigs.forEach(config => {
      Object.values(config.files).forEach((fileName) => {
        this.fileWorkerMap.set(fileName as string, config.worker);
      });
    });

    console.log('CREAMOS LOS ARCHIVOS DE LOS WORKERS')
  }

  // Pasamos del formato recibido {name: 'changeDayNight', value: 1} al siguiente {changeDayNight: true}
  prepareObjectConfig = (newConfig: any[]) => {
    return newConfig.reduce((acc: any, curr: any) => {
      acc[curr.name] = curr.value;
      return acc;
    }, {} as any);
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

        console.log({ configToSendIotBroker })
        this.iotBrokerWorker.postMessage({ type: 'CONFIGURE', payload: configToSendIotBroker });
      }

      if (newConfig?.categoriser || changePriorityQueues) {
        console.log('ENTRO AQUI')
        //Damos formato al objeto config del Categoriser
        console.log(newConfig)
        const configToSendCategoriser = newConfig?.categoriser ? this.prepareObjectConfig(newConfig.categoriser) : {};

        if (changePriorityQueues) {
          configToSendCategoriser['minPriority'] = this.lastPriorityLength
        }
        console.log({ configToSendCategoriser })
        this.categoriserWorker.postMessage({ type: 'CONFIGURE', payload: configToSendCategoriser });
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

      this.iotBrokerWorker.postMessage({ type: 'PLAY_PAUSE', payload: isPlaying });

      this.categoriserWorker.postMessage({ type: 'PLAY_PAUSE', payload: isPlaying });
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

      this.iotBrokerWorker.postMessage({ type: 'START' });
      this.categoriserWorker.postMessage({ type: 'START' });

    } catch (error) {
      this.toggleInitializedSimulation(false);
      console.error('Se ha producido un error al incializar los workers: ' + error);
    }
  }

  private initIotBroker = () => {
    if (this.iotBrokerWorker) return;

    this.iotBrokerWorker = new Worker(
      new URL('./workers/iot-broker.worker', import.meta.url)
    );

  }

  private initWorkers() {
    this.initIotBroker();

    if (!this.categoriserWorker)
      this.categoriserWorker = new Worker(
        new URL('./workers/categoriser.worker', import.meta.url)
      );


    // Creamos un canal de comunicacion gracias a MessageChannel.
    this.createChannel(this.iotBrokerWorker, this.categoriserWorker);
  }

  private createChannel(firstWorker: Worker, secondWorker: Worker) {
    const channel = new MessageChannel();

    firstWorker.postMessage({ type: 'CONNECT_CHANNEL' }, [channel.port1]);
    secondWorker.postMessage({ type: 'CONNECT_CHANNEL' }, [channel.port2]);
    console.log('Service: Canal directo establecido entre Broker y Categoriser.');
  }
}
