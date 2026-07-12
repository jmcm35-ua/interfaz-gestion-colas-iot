import { Component, Input } from '@angular/core';
import { MatIcon } from "@angular/material/icon";
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgForOf } from "../../../../node_modules/@angular/common/index";
import { SimulationService } from 'app/core/simulation/simulation.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-files',
  standalone: true,
  imports: [MatIcon, MatTooltipModule, MatButtonModule],
  templateUrl: './files.component.html',
  styleUrl: './files.component.scss',
})
export class FilesComponent {
  private subToInitalizedSim: Subscription | undefined;
  @Input() tooltip: string | undefined;
  files: any[] = [];

  constructor(private simulationService: SimulationService) { }

  ngOnInit() {
    // Nos suscribimos a los cambios de la variable
    this.subToInitalizedSim = this.simulationService.isInitialized$.subscribe(isInit => {

      if (isInit) {
        this.files = [];
        this.simulationService.fileWorkerMap.forEach((worker, fileName) => {
          this.files.push({ name: fileName });
        });
      }
    });
  }

  ngOnDestroy() {
    // Limpiamos la suscripcion
    if (this.subToInitalizedSim) {
      this.subToInitalizedSim.unsubscribe();
    }
  }


  download = (name?: string) => {
    this.simulationService.downloadCSV(name);
  }


}
