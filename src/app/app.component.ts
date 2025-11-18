import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import {MatButtonModule} from '@angular/material/button';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { IconsService } from './core/icons/icons.service';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MatIconModule, MatButtonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {

  constructor(IconsService: IconsService) {}
  title = 'gestion-colas';

}
