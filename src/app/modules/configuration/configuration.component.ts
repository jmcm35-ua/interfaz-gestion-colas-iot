import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
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

@Component({
  selector: 'app-configuration',
  imports: [CommonModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSlideToggle, MatTooltipModule, FormsModule],
  standalone: true,
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss'],
})
export class ConfigurationComponent {
  @Output() close: EventEmitter<void> = new EventEmitter<void>();
  @Input() tooltip: string | undefined;

  simulationRunning: boolean = true;

  configForm: UntypedFormGroup | undefined;

  lastConfiguration: any = { // Aqu'i guardamos el estado de la ultima configuracion mandada al servicio. Si no han habido cambios en una, no se envia
    iotBroker: [],
    categoriser: [],
    dispatcher: [],
    consumer: []
  };

  variablesIotBroker: Variables[] = [
    { name: 'maxMsg', value: 1000, text: 'Máximo de mensajes por remesa', minimum: 1, maximum: 10000, input: true },
    { name: 'minMsg', value: 100, text: 'Mínimo de mensajes por remesa', minimum: 1, maximum: 10000, input: true },
    { name: 'changeDayNight', value: 1, text: 'Ciclos de día y noche', minimum: -1, maximum: -1, input: false },
    { name: 'factorNight', value: 0.2, text: 'Factor noche', minimum: 0, maximum: 1, input: true },
    { name: 'maxTimeToGenerateMsg', value: 1000, text: 'Tiempo máximo para generar una remesa (ms)', minimum: 100, maximum: 10000000, input: true },
    { name: 'maxQueueMsg', value: -1, text: 'Mensajes en la cola para depuración', minimum: -1, maximum: 1000000, input: true },
    {
      name: 'weights', value: [
        0.05,
        0.20,
        0.30,
        0.45,
      ], text: 'Prioridad máxima de los mensajes', minimum: 1, maximum: 100, input: true
    },
    { name: 'totalMessages', value: 1000000, text: 'Total de mensajes a generar', minimum: 1000, maximum: 100000000, input: true }
  ]

  variablesCategoriser: Variables[] = [
    { name: 'expirationVerifiction', value: 1000, text: 'Verificación de expiración (ms)', minimum: 100, maximum: 10000000, input: true },
    { name: 'expirationMaxQueueMsg', value: -1, text: 'Máximo número de mensajes en cola', minimum: -1, maximum: 1000000, input: true },
    { name: 'num_messages', value: 1000, text: 'Mensajes a solicitar del IoT Broker', minimum: 1, maximum: 1000000, input: true },
    { name: 'timeToReadIotBroker', value: 500, text: 'Tiempo a esperar entre lecturas (ms)', minimum: 100, maximum: 10000000, input: true }
  ]

  variablesDispatcher: Variables[] = [
    { name: 'maxSortQueue', value: -1, text: 'Número de colas priorizadas', minimum: -1, maximum: 20, input: true },
    { name: 'numMessages', value: 1000, text: 'Mensajes a solicitar del Categoriser', minimum: 1, maximum: 1000000, input: true },
    { name: 'tiempoLectura', value: 1000, text: 'Tiempo a esperar entre lecturas (ms)', minimum: 100, maximum: 10000000, input: true },
  ]

  variablesConsumer: Variables[] = [
    { name: 'num', value: 1000, text: 'Mensajes que se sirven al sistema', minimum: 1, maximum: 1000000, input: true },
    { name: 'timeLectura', value: 1000, text: 'Tiempo a esperar entre lecturas (ms)', minimum: 100, maximum: 10000000, input: true },
  ]

  isOpen = {
    iot: true,
    categoriser: true,
    dispatcher: true,
    consumer: true
  };

  constructor(
    private _fuseConfirmationService: FuseConfirmationService,
    private simulationService: SimulationService // Inyectamos el servicio del simulador
  ) { }

  closePanel() {
    console.log("Closing panel");
    this.close.emit();
  }

  isNumber(value: any): boolean {
    console.log(value, typeof value);
    return typeof value === 'number';
  }

  totalWeight = 1;

  ngOnInit() {
    this.lastConfiguration = {
      iotBroker: this.extractValues(this.variablesIotBroker),
      categoriser: this.extractValues(this.variablesCategoriser),
      dispatcher: this.extractValues(this.variablesDispatcher),
      consumer: this.extractValues(this.variablesConsumer)
    };
    this.updateTotal(false);
    this.applyConfiguration();
  }

  //************************************************************
  //! Funciones para verificar los datos de la configuracion
  //************************************************************
  updateQueueCount(count: number) {
    count = Number(count);
    if (count < 1) count = 1;

    const maxPriorityVar = this.variablesIotBroker.find(v => v.name === 'weights');
    if (!maxPriorityVar || !Array.isArray(maxPriorityVar.value)) {
      console.warn('weights no definido o no es un array');
      return;
    }
    const queues = maxPriorityVar.value;

    while (queues.length < count) {
      queues.push(0.01);
    }

    while (queues.length > count) {
      queues.pop();
    }

    this.updateTotal();
  }

  updateTotal(configureSimulation: boolean = true) {
    const maxPriorityVar = this.variablesIotBroker.find(v => v.name === 'weights');
    if (!maxPriorityVar || !Array.isArray(maxPriorityVar.value)) {
      console.warn('weights no definido o no es un array');
      return;
    }
    const queues = maxPriorityVar.value;
    console.trace('Rastreando llamada a updateTotal. configureSimulation:', configureSimulation);
    this.totalWeight = queues
      .map(q => Number(this.onWeightValue(q)))
      .reduce((a, b) => a + b, 0);
    console.log('Cuatntas veces paso por aqui?')
    if (this.totalWeight === 100 && configureSimulation) this.applyConfiguration();
  }

  weightPercent(i: number) {
    const maxPriorityVar = this.variablesIotBroker.find(v => v.name === 'weights');
    const queues = maxPriorityVar?.value as number[];

    return queues[i] * 100;
  }

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

  onWeightValue(value: number) {
    return Math.round((value * 100) * 10000) / 10000;
  }

  onChangePercent(value: any, q: any) {
    if (value === '' || value === null) {
      return;
    }

    q = Number(value) / 100;
  }

  onEnter(event: any, variable: Variables) {
    (event.target as HTMLInputElement).blur();
  }

  checkValue(event: any, variable: Variables, configureSimulation: boolean = true) {
    let value = Number(event);
    const minValue = variable.minimum ?? -1;
    const maxValue = variable.maximum ?? -1;

    let newValue = 0;
    if (minValue !== -99 && value < minValue) {
      newValue = minValue;
    } else if (maxValue !== -99 && value > maxValue) {
      newValue = maxValue;
    } else {
      newValue = value;
    }

    console.log(variable.value, newValue)
    if (variable.value === newValue) return; // Si no ha habido un cambio en el valor nos salimos de la funcion y no lanzamos nada

    variable.value = newValue;

    if (configureSimulation) this.applyConfiguration(); // Si el cambio viene de un input, actualiza. Si viene de un JSON, espera a que  esten todos
  }

  extractValues(variables: Variables[]): any {
    const result: { name: string, value: any }[] = [];
    variables.forEach(variable => {
      result.push({ name: variable.name, value: variable.value });
    });
    return result;
  }

  applyConfiguration() {
    console.log("Calculando cambios...");

    const newConfigSimulation: any = {
      iotBroker: this.extractValues(this.variablesIotBroker),
      categoriser: this.extractValues(this.variablesCategoriser),
      dispatcher: this.extractValues(this.variablesDispatcher),
      consumer: this.extractValues(this.variablesConsumer)
    };

    console.log({ newConfigSimulation })

    const configToSend: any = {};
    let hasChanges = false;

    Object.keys(newConfigSimulation).forEach((key) => {
      const oldConfString = JSON.stringify(this.lastConfiguration[key]);
      const newConfString = JSON.stringify(newConfigSimulation[key]);

      if (oldConfString !== newConfString) {
        // SOLO metemos en el paquete lo que ha cambiado
        configToSend[key] = newConfigSimulation[key];
        console.log(configToSend[key], key);
        // Actualizamos el historial
        this.lastConfiguration[key] = JSON.parse(newConfString);
        hasChanges = true;
      }
    });

    console.log({ newConfigSimulation, configToSend })
    console.log("Config real en este instante:", JSON.parse(JSON.stringify(configToSend)));
    if (hasChanges) {
      const cleanDelta = JSON.parse(JSON.stringify(configToSend));

      console.log("Enviando Delta Limpio:", cleanDelta);
      this.simulationService.configureSimulation(cleanDelta);
    } else {
      console.log("No hay cambios detectados, no se envía nada.");
    }
  }

  //************************************************************
  //! Funcion para descargar el archivo JSON de la configuracion
  //************************************************************
  async downloadJSON() {


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

    const fileHandle = await (window as any).showSaveFilePicker(options);

    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
  }

  draggingFile = false;

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.draggingFile = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.draggingFile = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.draggingFile = false;

    if (!event.dataTransfer) return;

    this.onJSONSelected(event);
  }

  onJSONSelected(event: any) {
    let file: File | undefined;

    if (event.dataTransfer?.files?.length) {
      file = event.dataTransfer.files[0];
    } else if (event.target?.files?.length) {
      file = event.target.files[0];
      event.target.value = '';
    }

    if (!file?.name.endsWith('.json')) {
      alert("Solo se permiten archivos JSON");
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
    }
  }

  loadJSON(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        let sectionVariables: Variables[] = [];
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

          section.variables.forEach((varFromFile: any) => {
            const variable = sectionVariables.find(v => v.name === varFromFile.name);
            if (!variable) return;

            if (variable.name === 'weights') {
              // Esta logica hay que moverla a una función aparte porque se repite y realizar una comprobacion de que todos los valores sumen 1
              variable.value = varFromFile.value;
              this.updateTotal(false);
            } else {
              this.checkValue(varFromFile.value, variable);
            }
          });
        }

        this.applyConfiguration();

      } catch (err) {
        console.error("El archivo no es un JSON válido", err);
        alert("El archivo no es un JSON válido");
      }
    };

    reader.readAsText(file);
  }

}
