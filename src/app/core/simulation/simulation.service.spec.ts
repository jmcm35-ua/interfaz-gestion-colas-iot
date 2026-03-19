import { TestBed } from '@angular/core/testing';

import { SimulationService } from './simulation.service';
//! Aquí se ejecutarán las pruebas de la simulación

describe('SimulationService', () => {
  let service: SimulationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SimulationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
