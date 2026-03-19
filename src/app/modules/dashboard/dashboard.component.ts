import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SimulationService } from 'app/core/simulation/simulation.service';

@Component({
  selector: 'app-dashboard',
  imports: [MatIconModule, MatButtonModule, MatTooltipModule],
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  textoAccionPlayPause: string = 'Iniciar simulación';
  isSimulating = false;
  isInitialized = false;

  constructor(private simulationService: SimulationService) { }


  toggleStateSimulation() {
    // if (!this.isInitialized) {
    //   this.simulationService.startSimulation();
    //   this.isInitialized = true;
    // }
    // this.isSimulating = !this.isSimulating;
    this.simulationService.handleStateSimulation(); // Aqui se gestiona si esta inicializada la simulacion o en ejecucion/pausa

  }
}
