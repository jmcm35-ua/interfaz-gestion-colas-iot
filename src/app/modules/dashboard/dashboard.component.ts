import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, NgZone, QueryList, ViewChildren } from '@angular/core';
import { SimulationService } from 'app/core/simulation/simulation.service';
import { WorkerMetricsSnapshot } from 'app/core/types/workers.types';
import { Subscription } from 'rxjs';
import { Chart, registerables } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { CommonModule } from '@angular/common';

import { MatIcon } from "@angular/material/icon";
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

Chart.register(...registerables);

type ChartName = 'broker' | 'categoriser' | 'consumer' | 'expiredBar';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  imports: [CommonModule, MatIcon, MatButtonModule, MatTooltipModule],
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
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

  nameImages = {
    broker: 'Dispersion-Produccion',
    categoriser: 'Procesamiento-Prioridad',
    consumer: 'Distribucion-Carga',
    expiredBar: 'Validos-Expirados-Prioridad'
  } as const;

  getImageName(chart: keyof typeof this.nameImages) {
    return this.nameImages[chart];
  }

  // Referencias a contenedores
  @ViewChild('scatterBroker') scatterRef!: ElementRef;
  @ViewChild('pieCategoriser') pieRef!: ElementRef;
  @ViewChild('lineConsumer') lineRef!: ElementRef;
  @ViewChild('expiredBar') barRef!: ElementRef;
  @ViewChild('totalMessages') totalMessages!: ElementRef;

  dataQueuesTime: number[] = [];
  constructor(private simulationService: SimulationService) { }

  ngOnInit(): void {
    Chart.register(zoomPlugin);

    this.metricsSub = this.simulationService.metrics$.subscribe(snapshot => {
      if (snapshot) this.updateAllCharts(snapshot);
    });

    this.subToInitalizedSim = this.simulationService.isInitialized$.subscribe(isInit => {

      if (isInit) {
        this.resetCharts();
        this.initializeCharts();
      }
    });
  }

  // Función para descargar los gráficos
  downloadChart(chart: ChartName) {
    if (!this.charts || !this.charts[chart]) return;

    const img = this.charts[chart].canvas.toDataURL("img/png");

    const downloadLink = document.createElement('a');
    downloadLink.href = img;
    downloadLink.download = this.getImageName(chart) + '.png';

    downloadLink.click();
  }

  // Función para inicializar los gráficos
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
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: {
                enabled: true
              },
              mode: 'x',
            },
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
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: 'ctrl',
            },
            zoom: {
              drag: {
                enabled: true
              },
              mode: 'x',
            },
          }
        }
      }
    });

    this.charts['expiredBar'] = new Chart(this.barRef.nativeElement, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Válidos',
            data: [],
            backgroundColor: this.colors[0]
          },
          {
            label: 'Expirados',
            data: [],
            backgroundColor: this.colors[3]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
          },
          y: {
            stacked: true
          }
        }
      }
    })
  }

  // Función para reiniciar los gráficos
  private resetCharts() {

    Object.values(this.charts).forEach(chart => {
      chart.destroy();
    })

    this.charts = {};

    if (this.totalMessages?.nativeElement) this.totalMessages.nativeElement.innerText = '0';
    if (this.dataQueuesTime) this.dataQueuesTime = [];
  }

  // Función para llamar a actualizar a todos los gráficos
  private updateAllCharts(snapshot: WorkerMetricsSnapshot) {
    this.updateScatterChart(snapshot);
    this.updatePieChart(snapshot);
    this.updateLineChart(snapshot);
    this.updateBarChart(snapshot)
  }

  // Función para actualizar el gráfico de barras
  private updateBarChart(snapshot: WorkerMetricsSnapshot) {
    const chart = this.charts['expiredBar'];
    const expiredMessages = snapshot.consumer.messagesExpired;
    const totalReceivedMessages = snapshot.consumer.readByPriority;

    const correctMessages = totalReceivedMessages.map((totalCorrect, index) => totalCorrect - expiredMessages[index]);

    if (expiredMessages.length > chart.data.labels!.length) {
      for (let i = chart.data.labels!.length; i < expiredMessages.length; i++) {
        chart.data.labels!.push(`Cola ${i + 1}`);
      }
    }
    chart.data.datasets[0].data = [...correctMessages]
    chart.data.datasets[1].data = [...expiredMessages];

    chart.update('none');
  }

  // Función para actuaizar el gráfico "quesito"
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
    const data = snapshot.categoriser.queuesLength; // N colas

    // Total de líneas que necesitamos: N colas + 1 de expirados
    const totalRequiredLines = data.length + 1;

    // Creación de datasets si no existen
    if (totalRequiredLines > chart.data.datasets.length) {
      for (let i = chart.data.datasets.length; i < totalRequiredLines; i++) {
        // Si es el índice 0, es Expirados. Si no, restamos 1 para que empiece en Q1, Q2...
        const label = i === 0 ? 'Expirados' : `Q${i}`;
        const color = this.getColor(i === 0 ? this.colors.length - 1 : i); // Evitamos desbordar el array de colores

        chart.data.datasets.push({
          label: label,
          data: [],
          backgroundColor: color,
          borderColor: color,
          radius: 0,
          borderWidth: 1
        });
      }
    }

    // Actualizamos la linea de expirados
    (chart.data.datasets[0].data as any[]).push({
      x: snapshot.timestamp,
      y: snapshot.categoriser.expirationQueue
    });

    // Actualizamos las lineas de cada cola de prioridad
    data.forEach((val, idx) => {
      (chart.data.datasets[idx + 1].data as any[]).push({
        x: snapshot.timestamp,
        y: val
      });
    });

    chart.update('none');
  }

  private updateScatterChart(snapshot: WorkerMetricsSnapshot) {
    const chart = this.charts['broker'];
    const generatedMessages = snapshot.iotBroker.generatedMessages;

    if (Object.values(generatedMessages).length === 0) return;

    this.totalMessages.nativeElement.innerHTML = snapshot.iotBroker.totalProduced;
    if (generatedMessages)
      (chart.data.datasets[0].data as any[]).push(...generatedMessages.map(gen => ({ x: gen.time, y: gen.total })));
    else
      (chart.data.datasets[0].data as any[]).push({ x: 0, y: 0 });


    chart.update('none');
  }

  private getColor(index: number): string {
    return this.colors[index]
  }

  resetZoom(chart: string) {
    if (!this.charts || !this.charts[chart]) return;

    this.charts[chart].resetZoom();
  }

  ngOnDestroy(): void {
    this.metricsSub?.unsubscribe();
    Object.values(this.charts).forEach(c => c.destroy());

    if (this.subToInitalizedSim) {
      this.subToInitalizedSim.unsubscribe();
    }
  }

}