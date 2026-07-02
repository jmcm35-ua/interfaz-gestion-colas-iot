import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggle } from "@angular/material/slide-toggle";
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule, UntypedFormGroup } from '@angular/forms';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { SimulationService } from 'app/core/simulation/simulation.service';
import { Variables } from 'app/core/types/variables.types';
import { Subscription } from 'rxjs';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-configuration',
  imports: [CommonModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatCheckboxModule, MatTooltipModule, FormsModule],
  standalone: true,
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss'],
})
export class ConfigurationComponent implements OnInit, OnDestroy {
  @Output() close: EventEmitter<void> = new EventEmitter<void>();
  @Input() tooltip: string | undefined;
  private subToInitalizedSim: Subscription | undefined;

  simulationRunning: boolean = true;

  configForm: UntypedFormGroup | undefined;

  lastConfiguration: any = { // Aqui guardamos el estado de la ultima configuracion mandada al servicio. Si no han habido cambios en una, no se envia
    iotBroker: [],
    categoriser: [],
    dispatcher: [],
    consumer: []
  };

  variablesIotBroker: Variables[] = [
    { name: 'maxMsg', value: 1000, text: 'Máximo de mensajes por remesa', minimum: 1, maximum: 10000, input: true },
    { name: 'minMsg', value: 100, text: 'Mínimo de mensajes por remesa', minimum: 1, maximum: 10000, input: true },
    { name: 'changeDayNight', value: 1, text: 'Ciclos día y noche', minimum: -1, maximum: -1, input: false },
    { name: 'factorNight', value: 0.2, text: 'Factor noche', minimum: 0, maximum: 1, input: true },
    { name: 'maxTimeToGenerateMsg', value: 1000, text: 'Tiempo máximo para generar una remesa (ms)', minimum: 100, maximum: 10000000, input: true },
    { name: 'maxQueueMsg', value: -1, text: 'Mensajes en la cola para depuración', minimum: -1, maximum: 1000000, input: true },
    { name: 'totalMessages', value: 1000000, text: 'Total de mensajes a generar', minimum: 1000, maximum: 100000000, input: true },
    {
      name: 'weights', value: [
        0.05,
        0.20,
        0.30,
        0.45,
      ], text: 'Prioridad máxima de los mensajes', minimum: 0.01, maximum: 1, input: true
    }
  ]

  variablesCategoriser: Variables[] = [
    { name: 'expirationVerifiction', value: 1000, text: 'Verificación de expiración (ms)', minimum: 100, maximum: 10000000, input: true },
    { name: 'expirationMaxQueueMsg', value: -1, text: 'Máximo número de mensajes en cola', minimum: -1, maximum: 1000000, input: true },
    { name: 'numMessages', value: 1000, text: 'Mensajes a solicitar del IoT Broker', minimum: 1, maximum: 1000000, input: true },
    { name: 'timeToReadIotBroker', value: 500, text: 'Tiempo a esperar entre lecturas (ms)', minimum: 100, maximum: 10000000, input: true },
    {
      name: 'priorityExpirationTimeQueue',
      value: [
        5000,
        10000,
        20000,
        60000
      ],
      text: 'Tiempo que tarda en expirar cada cola',
      minimum: 100, maximum: 1000000000, input: true
    }
  ]

  variablesDispatcher: Variables[] = [
    { name: 'maxSortQueue', value: -1, text: 'Número de máximo de mensajes en cola priorizada', minimum: -1, maximum: 10000000, input: true },
    { name: 'numMessages', value: 1000, text: '(msgPWR) Mensajes a solicitar del Categoriser', minimum: 1, maximum: 1000000, input: true },
    { name: 'timeToReadCategoriser', value: 1000, text: 'Tiempo a esperar entre lecturas (ms)', minimum: 100, maximum: 10000000, input: true },
    {
      name: 'powerPriority',
      value: [
        1,
        0.5,
        0.25,
        0.125
      ],
      text: 'Porcentaje de lectura de cada cola',
      minimum: 0.00001, maximum: 1, input: true
    }
  ]

  variablesConsumer: Variables[] = [
    { name: 'numMessagesToRead', value: 1000, text: 'Mensajes que se sirven al sistema', minimum: 1, maximum: 1000000, input: true },
    { name: 'timeToReadDispatcher', value: 1000, text: 'Tiempo a esperar entre lecturas (ms)', minimum: 100, maximum: 10000000, input: true },
  ]

  isOpen = {
    iot: true,
    categoriser: true,
    dispatcher: true,
    consumer: true
  };

  stepInterval: any;
  stepTimeout: any;

  constructor(
    private _fuseConfirmationService: FuseConfirmationService,
    private simulationService: SimulationService // Inyectamos el servicio del simulador
  ) { }

  ngOnInit() {
    this.lastConfiguration = {
      iotBroker: this.extractValues(this.variablesIotBroker),
      categoriser: this.extractValues(this.variablesCategoriser),
      dispatcher: this.extractValues(this.variablesDispatcher),
      consumer: this.extractValues(this.variablesConsumer)
    };
    this.updateTotal(false);
    this.applyConfiguration();

    // Nos suscribimos a los cambios de la variable
    this.subToInitalizedSim = this.simulationService.isInitialized$.subscribe(isInit => {
      this.simulationRunning = isInit;
    });
  }

  ngOnDestroy() {
    if (this.subToInitalizedSim) {
      this.subToInitalizedSim.unsubscribe();
    }
  }

  getVariableBroker(name: string): Variables | undefined {
    const variable = this.variablesIotBroker.find(v => v.name === name);
    return variable;
  }

  getVariableCategoriser(name: string): Variables | undefined {
    const variable = this.variablesCategoriser.find(v => v.name === name);
    return variable;
  }

  getVariableDispatcher(name: string): Variables | undefined {
    const variable = this.variablesDispatcher.find(v => v.name === name);
    return variable;
  }


  closePanel() {
    this.close.emit();
  }


  totalWeight = 1;

  //************************************************************
  //! Funciones para verificar los datos de la configuracion
  //************************************************************
  updateQueueCount(count: number) {
    count = Number(count);
    if (count < 1) count = 1;

    // Buscamos las 3 variables involucradas en las distintas secciones
    const weightsVar = this.variablesIotBroker.find(v => v.name === 'weights');
    const expirationVar = this.variablesCategoriser.find(v => v.name === 'priorityExpirationTimeQueue');
    const priorityVar = this.variablesDispatcher.find(v => v.name === 'powerPriority');

    if (!weightsVar || !Array.isArray(weightsVar.value) ||
      !expirationVar || !Array.isArray(expirationVar.value) ||
      !priorityVar || !Array.isArray(priorityVar.value)) {
      console.warn('Alguna de las variables de colas no está definida como array.');
      return;
    }

    const weights = weightsVar.value;
    const expirations = expirationVar.value;
    const priorities = priorityVar.value;

    // Añadir colas si el contador sube
    while (weights.length < count) {
      weights.push(0.01);         // Default: 1% de peso
      expirations.push(expirations[expirations.length - 1] * 2);    // Default: 10000 ms de expiración
      priorities.push(priorities[priorities.length - 1] / 2);       // Default: 50% de poder de consumo
    }

    // Quitar colas si el contador baja
    while (weights.length > count) {
      weights.pop();
      expirations.pop();
      priorities.pop();
    }

    this.updateTotal(); // Actualiza sumas y envía al backend/simulador
  }

  // GET y SET para Expiración (Categoriser)
  getExpiration(index: number): number {
    const expVar = this.variablesCategoriser.find(v => v.name === 'priorityExpirationTimeQueue');
    return expVar ? (expVar.value as number[])[index] : 0;
  }

  setExpiration(event: any, index: number) {
    let value = parseFloat(event.target.value);
    if (isNaN(value) || value < 1) value = 1; // Valor mínimo

    const expVar = this.variablesCategoriser.find(v => v.name === 'priorityExpirationTimeQueue');
    if (expVar) {
      const expArray = expVar.value as number[];
      if (expArray[index] !== value) {
        expArray[index] = value;
        this.applyConfiguration();
      }
    }
  }

  // GET y SET para Poder de consumo (Dispatcher)
  getPriority(index: number): number {
    const priVar = this.variablesDispatcher.find(v => v.name === 'powerPriority');
    return priVar ? Math.round(((priVar.value as number[])[index] * 100) * 10000) / 10000 : 0;
  }

  setPriority(event: any, index: number) {
    const priVar = this.variablesDispatcher.find(v => v.name === 'powerPriority');
    let value = parseFloat(event.target.value) / 100;
    const minValue = priVar?.minimum ?? 0;
    const maxValue = priVar?.maximum ?? 1;

    value = this.setLimits(value, minValue, maxValue);

    if (priVar) {
      const priArray = priVar.value as number[];
      if (priArray[index] !== value) {
        priArray[index] = value;
        this.applyConfiguration();
      }
    }
  }

  // Función genérica para quitar el foco al pulsar Enter en los nuevos inputs
  onEnterGeneric(event: any) {
    (event.target as HTMLInputElement).blur();
  }

  trackByIndex(index: number, item: any): number {
    return index;
  }

  // Actualiza el total de los pesos de generación de mensajes por cola
  updateTotal(configureSimulation: boolean = true) {
    const maxPriorityVar = this.variablesIotBroker.find(v => v.name === 'weights');
    if (!maxPriorityVar || !Array.isArray(maxPriorityVar.value)) {
      console.warn('weights no definido o no es un array');
      return;
    }
    const queues = maxPriorityVar.value;
    this.totalWeight = queues
      .map(q => Number(this.onWeightValue(q)))
      .reduce((a, b) => a + b, 0);

    if (this.totalWeight !== 100 && configureSimulation) this.applyConfiguration();
  }

  // Saca el porcentaje de un peso
  weightPercent(i: number) {
    const maxPriorityVar = this.variablesIotBroker.find(v => v.name === 'weights');
    const queues = maxPriorityVar?.value as number[];

    return queues[i] * 100;
  }

  // Coloca el valor de los pesos entre 0 y 1
  setWeightPercent(i: number, value: number) {
    const maxPriorityVar = this.variablesIotBroker.find(v => v.name === 'weights');
    const queues = maxPriorityVar?.value as number[];

    queues[i] = value / 100;
  }

  onEnterWeight(event: any, index: number) {
    (event.target as HTMLInputElement).blur();
  }

  onWeightInput(event: any, index: number) {
    const value = parseFloat(event.target.value);
    const maxPriorityVar = this.variablesIotBroker.find(v => v.name === 'weights');
    if (!maxPriorityVar || !Array.isArray(maxPriorityVar.value)) {
      console.warn('weights no definido o no es un array');
      return;
    }

    const queues = maxPriorityVar.value;

    if (isNaN(value) || value < 1) {
      queues[index] = 0.01;
    } else if (value > 100) {
      queues[index] = 1;
    } else {
      queues[index] = Math.round((value / 100) * 10000) / 10000;
    }

    this.updateTotal();
  }

  // Función para gestionar los botones de los inputs
  startStepping(variable: Variables | undefined, step: number, event: MouseEvent, index?: number) {
    event.preventDefault(); // Evitamos que el input pierda el focus

    if (!variable) return;

    // Una pulsación rápida, sube un valor
    this.stepValue(variable, step, index);

    // Si lo mantiene, se actualiza cada 50ms
    this.stepTimeout = setTimeout(() => {
      this.stepInterval = setInterval(() => {
        this.stepValue(variable, step, index);
      }, 50);
    }, 400);
  }

  // Frena en seco y envía la configuración de golpe
  stopStepping() {
    clearTimeout(this.stepTimeout);
    clearInterval(this.stepInterval);

    this.applyConfiguration();
  }

  // Función para aumentar o disminuir el valor del input
  stepValue(variable: Variables, step: number, index?: number) {
    if (!variable) return;

    // Detectamos si es un array basándonos en si nos pasaron un índice
    const isArray = Array.isArray(variable.value) && index !== undefined;

    // Extraemos el valor actual correcto
    let current = isArray
      ? (variable.value as number[])[index!]
      : Number(variable.value) || 0;

    // Determinamos el salto lógico. (Ej: porcentajes saltan de 0.01 en 0.01, el resto de 1 en 1)
    let stepAmount = 1;
    if (variable.name === 'factorNight' || variable.name === 'weights') stepAmount = 0.01;
    else if (variable.name === 'powerPriority') stepAmount = 0.001;

    let newValue = current + (step * stepAmount);

    if (newValue < 1 && variable.name !== 'powerPriority') {
      newValue = Number(newValue.toFixed(2));
    }

    // Verificamos que no sobrepasen los límites
    const minValue = variable.minimum;
    const maxValue = variable.maximum;
    newValue = this.setLimits(newValue, minValue, maxValue);

    // Asignamos el nuevo valor donde corresponda
    if (isArray) {
      (variable.value as number[])[index!] = newValue;

      // Si estamos tocando los pesos, forzamos la actualización visual del total
      if (variable.name === 'weights') {
        this.updateTotal(false);
      }
    } else {
      variable.value = newValue;
    }
  }

  onWeightValue(value: number) {
    return Math.round((value * 100) * 10000) / 10000;
  }

  onChangePercent(value: any, q: any) {
    if (value === '' || value === null) {
      return;
    }

    q = Number(value) / 100;
  }

  onEnter(event: any, variable: Variables | undefined) {
    if (!variable) return;

    (event.target as HTMLInputElement).blur();
  }

  // Verifica que el valor sea correcto
  checkValue(event: any, variable: Variables | undefined, configureSimulation: boolean = true) {
    if (!variable) return;

    let value = Number(event.target.value);
    const minValue = variable.minimum ?? -1;
    const maxValue = variable.maximum ?? -1;

    variable.value = this.setLimits(value, minValue, maxValue);
    event.target.value = variable.value;

    if (configureSimulation) this.applyConfiguration(); // Si el cambio viene de un input, actualiza. Si viene de un JSON, espera a que  esten todos
  }

  // Si el valor se pasa de los límites, lo coloca en el extremo 
  setLimits(value: number, minValue: number, maxValue: number): number {
    let newValue = 0;
    if (!value || (minValue !== -99 && value < minValue)) {
      newValue = minValue;
    } else if (maxValue !== -99 && value > maxValue) {
      newValue = maxValue;
    } else {
      newValue = value;
    }

    return newValue;
  }

  // Función para dar forma al objeto de configuración
  extractValues(variables: Variables[]): any {
    const result: { name: string, value: any }[] = [];
    variables.forEach(variable => {
      result.push({ name: variable.name, value: structuredClone(variable.value) });
    });
    return result;
  }

  // Función para aplicar la configuración
  applyConfiguration() {
    if (this.totalWeight !== 100) { // No aplicamos cambios hasta que no sea 1 totalWeights
      return;
    }

    // Extraemos el estado actual de la configuracion
    const currentConfig: any = {
      iotBroker: this.extractValues(this.variablesIotBroker),
      categoriser: this.extractValues(this.variablesCategoriser),
      dispatcher: this.extractValues(this.variablesDispatcher),
      consumer: this.extractValues(this.variablesConsumer)
    };

    const configToSend: any = {};
    let hasChanges = false;

    // Iteramos en cada seccion para registrar los cambios
    Object.keys(currentConfig).forEach((sectionKey) => {
      const currentVariables = currentConfig[sectionKey] as any[];
      const lastVariables = this.lastConfiguration[sectionKey] as any[];

      // Buscamos solo las variables que han cambiado dentro de esta sección
      const deltaVariables = currentVariables.filter(currentVar => {
        const lastVar = lastVariables.find(v => v.name === currentVar.name);

        // Comparamos el valor actual con el anterior
        return JSON.stringify(currentVar.value) !== JSON.stringify(lastVar?.value);
      });

      if (deltaVariables.length > 0) {
        // SI HAY CAMBIOS: Enviamos solo las variables modificadas de esta sección
        configToSend[sectionKey] = deltaVariables;

        // Actualizamos el historial de ESTA sección con los nuevos valores
        this.lastConfiguration[sectionKey] = JSON.parse(JSON.stringify(currentVariables));
        hasChanges = true;
      }
    });

    if (hasChanges) {
      // Hacemos una copia limpia para evitar problemas de referencias
      const cleanDelta = JSON.parse(JSON.stringify(configToSend));
      console.log({ cleanDelta })
      this.simulationService.configureSimulation(cleanDelta);
    }
  }

  //************************************************************
  //! Funcion para descargar el archivo JSON de la configuracion
  //************************************************************
  async downloadJSON() {
    // Extraemos los parametros actuales
    const data = [
      {
        section: 'IoT Broker',
        variables: this.extractValues(this.variablesIotBroker)
      },
      {
        section: 'Categoriser',
        variables: this.extractValues(this.variablesCategoriser)
      },
      {
        section: 'Dispatcher',
        variables: this.extractValues(this.variablesDispatcher)
      },
      {
        section: 'Consumer',
        variables: this.extractValues(this.variablesConsumer)
      }
    ]

    // Damos formato JSON 
    const json = JSON.stringify(data, null, 2);
    const options = {
      suggestedName: 'configuration.json',
      types: [
        {
          description: 'JSON File',
          accept: { 'application/json': ['.json'] }
        }
      ]
    };

    // Mostramos la interfaz de descarga
    const fileHandle = await (window as any).showSaveFilePicker(options);

    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
  }

  onJSONSelected(event: any) {
    let file: File | undefined;

    if (event.dataTransfer?.files?.length) {
      file = event.dataTransfer.files[0];
    } else if (event.target?.files?.length) {
      file = event.target.files[0];
      event.target.value = '';
    }

    // Si detectamos que NO es un archivo JSON, enviamos un aviso
    if (!file?.name.endsWith('.json')) {
      const dialogRef = this._fuseConfirmationService.open({
        "title": "Error al importar la configuración",
        "message": "Solo se permiten archivos de formato JSON.",
        "icon": {
          "show": true,
          "name": "heroicons_solid:exclamation-circle",
          "color": "error"
        },
        "actions": {
          "confirm": {
            "show": false,
            "label": "",
            "color": "primary"
          },
          "cancel": {
            "show": true,
            "label": "Continuar"
          }
        },
        "dismissible": true
      }).afterClosed().subscribe((result) => {
        return;
      });
      return;
    }

    if (this.simulationRunning) { // Si la simulación está en marcha, pedir confirmación. 
      const dialogRef = this._fuseConfirmationService.open({
        "title": "Importar configuración",
        "message": "¿Estás seguro de que quieres importar la nueva configuración? <span class=\"font-medium\">¡Esta acción no se puede deshacer!</span>",
        "icon": {
          "show": true,
          "name": "heroicons_solid:archive-box",
          "color": "warning"
        },
        "actions": {
          "confirm": {
            "show": true,
            "label": "Importar",
            "color": "primary"
          },
          "cancel": {
            "show": true,
            "label": "Cancelar"
          }
        },
        "dismissible": true
      }).afterClosed().subscribe((result) => {
        if (result === 'confirmed') {
          this.loadJSON(file);
        } else {
          return;
        }
      });
    } else {
      this.loadJSON(file);
    }
  }

  // Función para darle valor a los parámetros con los datos del JSON
  loadJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        let sectionVariables: Variables[] = [];

        // Revisamos cada sección
        for (const section of data) {
          switch (section.section) {
            case 'IoT Broker':
              sectionVariables = this.variablesIotBroker;
              break;
            case 'Categoriser':
              sectionVariables = this.variablesCategoriser;
              break;
            case 'Dispatcher':
              sectionVariables = this.variablesDispatcher;
              break;
            case 'Consumer':
              sectionVariables = this.variablesConsumer;
              break;
          }

          // Para cada variable de esa sección
          section.variables.forEach((varFromFile: any) => {
            // Buscamos su nombre, si no tiene, salimos
            const variable = sectionVariables.find(v => v.name === varFromFile.name);
            if (!variable) return;

            // Si son pesos, llamamos a updateTotal
            if (variable.name === 'weights') {
              variable.value = varFromFile.value;
              this.updateTotal(false);
            } else {
              // El resto verificamos que los valores sean correctos
              const minValue = variable.minimum ?? -1;
              const maxValue = variable.maximum ?? -1;

              if (typeof varFromFile.value === 'number') {
                // Si es un solo número, le aplicamos el límite directamente
                variable.value = this.setLimits(varFromFile.value, minValue, maxValue);

              } else if (Array.isArray(varFromFile.value)) {
                // Si es un array, iteramos sobre cada valor con map() y le aplicamos el límite
                variable.value = varFromFile.value.map((val: number) =>
                  this.setLimits(val, minValue, maxValue)
                );

              } else {
                // Para booleanos se asignan directamente
                variable.value = varFromFile.value;
              }
            }
          });
        }

        this.variablesIotBroker = [...this.variablesIotBroker];
        this.variablesCategoriser = [...this.variablesCategoriser];
        this.variablesDispatcher = [...this.variablesDispatcher];
        this.variablesConsumer = [...this.variablesConsumer];

        this.applyConfiguration();
      } catch (err) {
        console.error("El archivo no es un JSON válido", err);
        alert("El archivo no es un JSON válido");
      }
    };

    reader.readAsText(file);
  }
}
