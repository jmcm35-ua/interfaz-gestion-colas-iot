import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { iotBrokerFilesName, categoriserFilesNames, dispatcherFilesNames, consumerFilesNames } from 'app/core/constants/files.constant'
import JSZip from 'jszip'; // Libreria para generar los ZIPs
import { BehaviorSubject, interval, Observable, of, Subscription, switchMap, filter } from 'rxjs';
import { Communication } from '../constants/communication.constant';
import { WorkerId, WorkerMap, WorkerMetricsSnapshot } from '../types/workers.types';

@Injectable({
  providedIn: 'root'
})
export class SimulationService {
  // Observable para saber si la simulación se ha inicializado
  private initializedSubject = new BehaviorSubject<boolean>(false);
  public isInitialized$ = this.initializedSubject.asObservable();

  // Observable para saber si la simulación se está ejecutando
  private runingSubject = new BehaviorSubject<boolean>(false);
  public isRuning$ = this.runingSubject.asObservable();

  idSimulation = 0;

  // Última prioridad registrada
  private lastPriorityLength = 4;

  // Observable pora las metricas de los workers
  private metricsSubject = new BehaviorSubject<WorkerMetricsSnapshot | null>(null);
  public metrics$ = this.metricsSubject.asObservable();

  private collectedMetrics: Record<string, any> = {};
  private pollSubscription!: Subscription;


  // Declaración de los Workers
  private workers: WorkerMap = {} as WorkerMap;

  // Mapeo de los nombres de los archivos que tendra cada worker
  fileWorkerMap = new Map<string, Worker>();

  constructor() {
    this.initWorkers();
    this.buildFileWorkerMap();
    this.setupGlobalMetricsCollector();
  }

  //!POSIBLE FALLO DETECTADO
  // tODO: SI SE PONE EN PAUSA, HABRIA QUE ACTUALIZAR EL TIEMPO INICIAL PARA QUE NO SE ROMPA LA REPODUCCION O ALGO ENTIENDO

  private initWorkers() {
    // Declaración explícita para que el bundler (Webpack/Esbuild) los reconozca
    this.workers = {
      iotBroker: new Worker(new URL('./workers/iot-broker.worker', import.meta.url)),
      categoriser: new Worker(new URL('./workers/categoriser.worker', import.meta.url)),
      dispatcher: new Worker(new URL('./workers/dispatcher.worker', import.meta.url)),
      consumer: new Worker(new URL('./workers/consumer.worker', import.meta.url))
    };

    // console.log("Workers inicializados correctamente");

    // Establecer canales
    this.createChannel(this.workers.iotBroker, this.workers.categoriser);
    this.createChannel(this.workers.categoriser, this.workers.dispatcher);
    this.createChannel(this.workers.dispatcher, this.workers.consumer);
  }

  // Función para configurar las métricas
  // Agregamos unos listener a los workers para capturar los mensajes de metricas
  private setupGlobalMetricsCollector() {
    Object.entries(this.workers).forEach(([workerID, worker]) => {
      worker.addEventListener('message', (event: MessageEvent) => {
        const { type, payload } = event?.data;

        if (type === 'METRICS_RESPONSE' && payload.idSimulation === this.idSimulation) {
          this.collectedMetrics[workerID] = payload.metrics;
        }
      })
    });

    this.pollSubscription = this.isRuning$.pipe(
      switchMap(isRuning =>
        isRuning ? interval(1000) : of(null)
      ),
      filter(tick => tick !== null)
    ).subscribe(() => {
      // Si esta corriendo el reloj (intervalo cada segundo)
      this.broadcast('GET_METRICS', this.idSimulation);


      // SI existe nuestro recolector de metricas, configuramos el observable para que el componente dashboard reciba la actualización
      if (Object.keys(this.collectedMetrics).length > 0) {
        const timestamp = this.collectedMetrics['iotBroker']?.timestamp || 0; // ¿ESTO HACE FALTA?
        const snapshot: WorkerMetricsSnapshot = {
          timestamp: timestamp,
          iotBroker: {
            queueSize: this.collectedMetrics['iotBroker']?.queueSize || 0,
            totalProduced: this.collectedMetrics['iotBroker']?.totalProduced || 0,
            generatedMessages: this.collectedMetrics['iotBroker']?.generatedMessages || []
          },
          categoriser: {
            queuesLength: this.collectedMetrics['categoriser']?.queuesLength || [],
            expirationQueue: this.collectedMetrics['categoriser']?.expirationQueue || 0
          },
          dispatcher: {
            sortPriorityQueue: this.collectedMetrics['dispatcher']?.sortPriorityQueue || 0,
          },
          consumer: {
            readByPriority: this.collectedMetrics['consumer']?.readByPriority || [],
            timePerPriority: this.collectedMetrics['consumer']?.timePerPriority || [],
            messagesExpired: this.collectedMetrics['consumer']?.messagesExpired || []
          }
        }

        this.metricsSubject.next(snapshot)
      }
    })
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
      console.error('Se ha producido un error al detener los workers: ' + error);
    }
  }

  configureSimulation = (newConfig: any) => {
    try {
      let changePriorityQueues = false;

      if (newConfig?.iotBroker) {
        // Damos formato al objeto config de IoT-Broker
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
    // Si no recibimos el nombre de un fichero, se da por hecho que quiere descargarlos todos
    const isZipMode = !singleFileName;
    const suggestedName = isZipMode ? 'simulation_logs.zip' : singleFileName;

    try {
      // Muestra la pantalla emergente del explorador de archivos para guardar el fichero
      const fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: suggestedName,
      });
      // Creamos un stream de escritura para volcar los datos directamente al disco
      const writable = await fileHandle.createWritable();

      // Si es un único archivo
      if (!isZipMode && singleFileName) {
        // Recogemos el worker al que pertenece el archivo
        const worker = this.fileWorkerMap.get(singleFileName);
        if (!worker) throw new Error(`No worker found for ${singleFileName}`);

        // Esperamos a que el Worker procese y devuelva el Blob/File
        const result = await this.processWorkerFileResponse(worker, singleFileName);
        // Escribimos el contenido del Blob en el destino
        await writable.write(result.content);

      } else {
        // Si quiere descargar todos los archivos...
        // Lanzamos todas las peticiones a los workers a la vez
        const promises: Promise<{ filename: string, content: Blob }>[] = [];
        this.fileWorkerMap.forEach((worker, filename) => {
          promises.push(this.processWorkerFileResponse(worker, filename));
        });

        // Esperamos la respuesta de todos los workers
        const allFiles = await Promise.all(promises);
        const zip = new JSZip();
        // Añadimos cada resultado al objeto ZIP
        allFiles.forEach(file => {
          zip.file(file.filename, file.content);
        });

        // Generamos el binario del ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });

        // Escribimos el ZIP generado en el archivo del usuario
        await writable.write(zipBlob);
      }

      // Cerramos el archivo de escritura para asegurar que estos se escriben en el disco
      await writable.close();
      // console.log('Archivo movido con éxito al disco local');

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
      // Definimos el listener de forma interna para poder referenciarlo al eliminarlo
      const listener = async (event: MessageEvent) => {
        const { type, payload, filename } = event.data;

        if (type === 'DOWNLOAD_FINISHED' && filename === name) {
          // Limpieza de memoria: eliminamos el listener una vez cumplida la promesa
          worker.removeEventListener('message', listener);

          /*  
            Payload es un FileSystemFileHandle, una referencia al OPFS.
            Al usar .getFile(), obtenemos un objeto File que es un puntero a los datos en disco.
            Esto evita el bloqueo y el desbordamiento de la RAM.
          */
          const fileHandle = payload as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          resolve({ filename, content: file });
        }
      };

      // Suscripción al canal de mensajes del worker
      worker.addEventListener('message', listener);
      // Notificamos al worker qué archivo específico debe procesar/preparar
      worker.postMessage({ type: 'DOWNLOAD_ONE_CSV', payload: name });
    });
  }

  getMetrics = () => {
    try {
      this.broadcast('GET_METRICS');
    } catch (error: any) {
      console.error('Se produjo un error al recoger las métricas de los workers: ', error);
    }
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

      this.broadcast('PLAY_PAUSE', isPlaying);

    } catch (error) {
      this.toggleInitializedSimulation(false);
      console.error(`Se ha producido un error al poner en ${this.isRuning$ ? 'PLAY' : 'PAUSE'} la simulacion: ` + error);
    }
  }

  startSimulation = () => {
    // Iniciamos el worker
    try {

      this.idSimulation++;

      this.collectedMetrics = {};
      this.metricsSubject.next(null);

      this.toggleInitializedSimulation(true);
      this.runingSubject.next(true);

      this.broadcast('START');

    } catch (error) {
      this.toggleInitializedSimulation(false);
      console.error('Se ha producido un error al incializar los workers: ' + error);
    }
  }

  private getWorker(id: WorkerId): Worker {
    return this.workers[id];
  }

  // Función para crear un canal de comunicación entre los Workers
  private createChannel(emisorWorker: Worker, receptorWorker: Worker) {
    const channel = new MessageChannel();

    emisorWorker.postMessage({ type: 'CONNECT_CHANNEL', payload: Communication.emisor }, [channel.port1]);
    receptorWorker.postMessage({ type: 'CONNECT_CHANNEL', payload: Communication.receptor }, [channel.port2]);
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
