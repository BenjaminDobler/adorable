import { TestBed } from '@angular/core/testing';

import { WebContainer } from './web-container';

describe('WebContainer', () => {
  let service: WebContainer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WebContainer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
