import { Component, Input } from '@angular/core';
import { MatIcon } from "@angular/material/icon";
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NgForOf } from "../../../../node_modules/@angular/common/index";
import { FileItem } from 'app/core/types/variables.types';

@Component({
  selector: 'app-files',
  standalone: true,
  imports: [MatIcon, MatTooltipModule, MatButtonModule],
  templateUrl: './files.component.html',
  styleUrl: './files.component.scss',
})
export class FilesComponent {
  @Input() tooltip: string | undefined;

  files: FileItem[] = [
    { id: 1, name: 'dispatcher.csv', url: '/assets/mocks/ventas.csv' },
    { id: 2, name: 'consumer.csv', url: '/assets/mocks/inventario.csv' },
    { id: 3, name: 'caducados.csv', url: '/assets/mocks/clientes.csv' }
  ];


}
