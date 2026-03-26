import { Component, ElementRef, HostListener, Input, ViewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { MatButtonModule, MatIconButton } from '@angular/material/button';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { IconsService } from './core/icons/icons.service';
import { ConfigurationComponent } from "./modules/configuration/configuration.component";
import { FilesComponent } from "./modules/files/files.component";
import { DashboardComponent } from './modules/dashboard/dashboard.component';
import { CommonModule } from '@angular/common';
import { FuseMediaWatcherService } from '@fuse/services/media-watcher';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { MatDrawerContainer, MatDrawer, MatDrawerContent } from "@angular/material/sidenav";
import { MatTooltipModule } from '@angular/material/tooltip';
import { SimulationService } from './core/simulation/simulation.service';
import { trigger, transition, style, animate, state } from '@angular/animations';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [MatIconModule, MatIconButton, MatButtonModule, DashboardComponent, ConfigurationComponent, CommonModule, FilesComponent, MatDrawerContainer, MatDrawer, MatDrawerContent, MatTooltipModule, RouterOutlet],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    animations: [
        trigger('fadeInOut', [
            transition(':enter', [
                style({ opacity: 0, transform: 'scale(0.8)' }),
                animate('200ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
            ]),
            transition(':leave', [
                animate('200ms ease-in', style({ opacity: 0, transform: 'scale(0.8)' }))
            ])
        ])
    ]
})
export class AppComponent {
    @Input() tooltip: string | undefined;
    private subToInitalizedSimulation: Subscription | undefined;
    private subToIsRuningSimulation: Subscription | undefined;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    textoAccionPlayPause: string = 'Iniciar simulación';
    isRuning = false;
    isInitialized = false;

    title = 'Simulador';

    // Controla si se muestra el modal de los archivos o no
    showFiles = false;
    // Referencia al componente de FilesComponent. Al usar read: ElementRef se obliga a Angular a devolver el elemento HTML
    @ViewChild('filesPanel', { read: ElementRef }) filesPanel!: ElementRef;

    // Tipo de animación de deslizamiento
    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    toggleStateSimulation() {
        // if (!this.isInitialized) {
        //   this.simulationService.startSimulation();
        //   this.isInitialized = true;
        // }
        // this.isSimulating = !this.isSimulating;
        this.simulationService.handleStateSimulation(); // Aqui se gestiona si esta inicializada la simulacion o en ejecucion/pausa
    }

    constructor(private _fuseMediaWatcherService: FuseMediaWatcherService, private simulationService: SimulationService) {
    }

    // Esto controla el panel deslizante de Configuration con el componente que nos ofrece la plantilla de Fuse Angular
    ngOnInit(): void {

        // Nos suscribimos a los cambios de la variable de la simulacion
        this.subToInitalizedSimulation = this.simulationService.isInitialized$.subscribe(isInit => {

            this.isInitialized = isInit;
        });

        this.subToIsRuningSimulation = this.simulationService.isRuning$.subscribe(isRuning => {

            this.isRuning = isRuning;
        });

        // Subscribe to media changes
        this._fuseMediaWatcherService.onMediaChange$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(({ matchingAliases }) => {
                // Set the drawerMode and drawerOpened if
                if (matchingAliases.includes('lg')) {
                    this.drawerMode = 'side';
                    this.drawerOpened = true;
                }
                else {
                    this.drawerMode = 'over';
                    this.drawerOpened = false;
                }
            });
    }

    stopSimulation = () => {
        if (this.isInitialized)
            this.simulationService.stopSimulation();
    }


    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    openFiles(event: Event): void { // Varía entre mostrar los archivos y no mostrarlos
        event?.stopPropagation();
        this.showFiles = !this.showFiles;
        console.log(this.showFiles)
        // event.stopPropagation();
    }

    // Listener para cuando estamos mostrando el componente de files. Si se pulsa fuera, se elimina
    @HostListener('document:click', ['$event'])
    clickout(event: any) {
        // Si no está visible el componente de files, se cancela
        if (!this.showFiles) {
            return;
        }

        // Almacenamos si el usuario ha clickado sobre el componente de Files
        const isClickInside = this.filesPanel?.nativeElement.contains(event.target as Node);
        console.log(isClickInside)
        if (!isClickInside) {
            this.showFiles = false;
        }
    }

}
