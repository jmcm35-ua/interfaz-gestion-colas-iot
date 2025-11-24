import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggle } from "@angular/material/slide-toggle";
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDivider } from "@angular/material/divider";

@Component({
  selector: 'app-configuration',
  imports: [CommonModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSlideToggle, MatTooltipModule, MatDivider],
  standalone: true,
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss'],
})
export class ConfigurationComponent {
  @Output() close: EventEmitter<void> = new EventEmitter<void>();
  @Input() tooltip: string;
  
  
  closePanel() {
    console.log("Closing panel");
    this.close.emit(); 
  }
}
