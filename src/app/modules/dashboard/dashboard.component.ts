import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone, QueryList, ViewChildren } from '@angular/core';
import { SimulationService } from 'app/core/simulation/simulation.service';
import { WorkerMetricsSnapshot } from 'app/core/types/workers.types';
import { Subscription } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { CommonModule } from '@angular/common';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  imports: [CommonModule],
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  private metricsSub!: Subscription;
  private charts: { [key: string]: Chart } = {};
  private subToInitalizedSim: Subscription | undefined;

  colors = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#f97316',
    '#6366f1',
    '#14b8a6',
    '#d946ef',
    '#a855f7',
    '#84cc16',
    '#eab308',
    '#f43f5e',
    '#64748b',
    '#0ea5e9',
    '#22c55e',
    '#a3e635',
    '#d1d5db'
  ];

  // Referencias a contenedores
  @ViewChild('scatterBroker') scatterRef!: ElementRef;
  @ViewChild('pieCategoriser') pieRef!: ElementRef;
  @ViewChild('lineConsumer') lineRef!: ElementRef;
  @ViewChild('totalMessages') totalMessages !: ElementRef;

  dataQueuesTime: number[] = [];
  constructor(private simulationService: SimulationService) { }

  ngOnInit(): void {
    Chart.register(zoomPlugin);

    this.metricsSub = this.simulationService.metrics$.subscribe(snapshot => {
      if (snapshot) this.updateAllCharts(snapshot);
    });

    this.subToInitalizedSim = this.simulationService.isInitialized$.subscribe(isInit => {

      if (isInit)
        this.initializeCharts();
    });
  }

  ngAfterViewInit(): void {
  }

  private initializeCharts() {
    this.charts['broker'] = new Chart(this.scatterRef.nativeElement, {
      type: 'line',
      data: { datasets: [{ label: 'Mensajes Creados', data: [], backgroundColor: '#3b82f6', borderColor: '#3b82f6', borderWidth: 1, pointRadius: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
          x: { type: 'linear', beginAtZero: false }
        },
        plugins: {
          zoom: {
            zoom: {
              wheel: {
                enabled: true,
              },
              pinch: {
                enabled: true
              },
              mode: 'xy',
            }
          }
        }
      },
    });

    this.charts['consumer'] = new Chart(this.pieRef.nativeElement, {
      type: 'pie',
      data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false // Oculta las etiquetas superiores
          }
        }
      }
    });

    this.charts['categoriser'] = new Chart(this.lineRef.nativeElement, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
          x: { type: 'linear', beginAtZero: false }
        },
        plugins: {
          zoom: {
            zoom: {
              wheel: { enabled: true },
              pinch: { enabled: true },
              mode: 'x',
            },
            limits: {
              x: { min: 'original', max: 100000 }
            },
            pan: {
              enabled: true,
              mode: 'x',
            }
          }
        }
      }
    });
  }

  private updateAllCharts(snapshot: WorkerMetricsSnapshot) {
    this.updateScatterChart(snapshot);
    this.updatePieChart(snapshot);
    this.updateLineChart(snapshot);
  }

  private updatePieChart(snapshot: WorkerMetricsSnapshot) {
    const chart = this.charts['consumer'];
    const lengths = snapshot.consumer.readByPriority;
    const times = snapshot.consumer.timePerPriority

    // Si aumentan las colas, expandimos dinámicamente
    if (lengths.length > chart.data.labels!.length) {
      for (let i = chart.data.labels!.length; i < lengths.length; i++) {
        chart.data.labels!.push(`Cola ${i + 1}`);
        (chart.data.datasets[0].data as number[]).push(0);
        (chart.data.datasets[0].backgroundColor as string[]).push(this.getColor(i));
      }
    }

    this.dataQueuesTime = times;
    chart.data.datasets[0].data = [...lengths];
    chart.update('none'); // 'none' evita animaciones pesadas
  }

  private updateLineChart(snapshot: WorkerMetricsSnapshot) {
    const chart = this.charts['categoriser'];
    const data = snapshot.categoriser.queuesLength;

    // Ajuste dinámico de líneas
    if (data.length > chart.data.datasets.length) {
      for (let i = chart.data.datasets.length; i < data.length; i++) {
        chart.data.datasets.push({ label: `Prio ${i + 1}`, data: [], borderColor: this.getColor(i), radius: 0, borderWidth: 1 });
      }
    }
    data.forEach((val, idx) => {
      (chart.data.datasets[idx].data as any[]).push({ x: snapshot.timestamp, y: val });
    });
    chart.update('none');
  }

  private updateScatterChart(snapshot: WorkerMetricsSnapshot) {
    // Aquí puedes implementar una lógica de "throttling" o "intervalo"
    // para que este gráfico no se actualice tan seguido como los otros.
    const chart = this.charts['broker'];
    const generatedMessages = snapshot.iotBroker.generatedMessages;

    this.totalMessages.nativeElement.innerHTML = snapshot.iotBroker.totalProduced;
    if (generatedMessages)
      (chart.data.datasets[0].data as any[]).push(...generatedMessages.map(gen => ({ x: snapshot.timestamp, y: gen })));
    else
      (chart.data.datasets[0].data as any[]).push({ x: 0, y: 0 });


    chart.update('none');
  }

  private getColor(index: number): string {
    return this.colors[index]
  }

  ngOnDestroy(): void {
    this.metricsSub?.unsubscribe();
    Object.values(this.charts).forEach(c => c.destroy());

    if (this.subToInitalizedSim) {
      this.subToInitalizedSim.unsubscribe();
    }
  }

}