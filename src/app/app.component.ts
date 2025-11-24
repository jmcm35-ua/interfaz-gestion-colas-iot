import { Component, Input } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import {MatButtonModule, MatIconButton} from '@angular/material/button';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { IconsService } from './core/icons/icons.service';
import { ConfigurationComponent } from "./modules/configuration/configuration.component";
import { FilesComponent } from "./modules/files/files.component";
import { DashboardComponent } from './modules/dashboard/dashboard.component';
import { CommonModule } from '@angular/common';
import { FuseMediaWatcherService } from '@fuse/services/media-watcher';
import { Subject, takeUntil } from 'rxjs';
import { MatDrawerContainer, MatDrawer, MatDrawerContent } from "@angular/material/sidenav";
import { MatTooltipModule } from '@angular/material/tooltip';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatIconModule, MatIconButton, MatButtonModule, DashboardComponent, ConfigurationComponent, CommonModule, MatDrawerContainer, MatDrawer, MatDrawerContent, MatTooltipModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  @Input() tooltip: string;
  title = 'Simulador';
  configOpen = false;

  toggleConfig() {
    console.log("Closing configuration panel");
    this.configOpen = !this.configOpen;
  }

  drawerMode: 'over' | 'side' = 'side';
  drawerOpened: boolean = true;
  private _unsubscribeAll: Subject<any> = new Subject<any>();

  constructor(private _fuseMediaWatcherService: FuseMediaWatcherService, IconsService: IconsService)
  {
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Lifecycle hooks
  // -----------------------------------------------------------------------------------------------------

  /**
   * On init
   */
  ngOnInit(): void
  {
      // Subscribe to media changes
      this._fuseMediaWatcherService.onMediaChange$
          .pipe(takeUntil(this._unsubscribeAll))
          .subscribe(({matchingAliases}) =>
          {
              // Set the drawerMode and drawerOpened if
              if ( matchingAliases.includes('lg') )
              {
                  this.drawerMode = 'side';
                  this.drawerOpened = true;
              }
              else
              {
                  this.drawerMode = 'over';
                  this.drawerOpened = false;
              }
          });
  }

  /**
   * On destroy
   */
  ngOnDestroy(): void
  {
      // Unsubscribe from all subscriptions
      this._unsubscribeAll.next(null);
      this._unsubscribeAll.complete();
  }
}
