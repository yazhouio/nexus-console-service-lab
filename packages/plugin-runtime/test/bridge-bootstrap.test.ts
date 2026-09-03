import { describe, expect, it } from 'vitest';

import {
  BridgeBootstrapValidationError,
  validateBridgeBootstrapDescriptor,
} from '../src';

describe('validateBridgeBootstrapDescriptor', () => {
  it('accepts only the minimum connection data', () => {
    expect(
      validateBridgeBootstrapDescriptor({
        protocolVersion: 1,
        surfaceInstanceId: 'surface-instance-1',
        nonce: 'one-time-nonce',
      }),
    ).toEqual({
      protocolVersion: 1,
      surfaceInstanceId: 'surface-instance-1',
      nonce: 'one-time-nonce',
    });
  });

  it.each(['pluginId', 'permissions', 'capabilities', 'token']) (
    'rejects identity or authority field %s',
    field => {
      expect(() =>
        validateBridgeBootstrapDescriptor({
          protocolVersion: 1,
          surfaceInstanceId: 'surface-instance-1',
          nonce: 'one-time-nonce',
          [field]: 'forged',
        }),
      ).toThrowError(BridgeBootstrapValidationError);
    },
  );

  it('rejects invalid protocol versions', () => {
    expect(() =>
      validateBridgeBootstrapDescriptor({
        protocolVersion: 0,
        surfaceInstanceId: 'surface-instance-1',
        nonce: 'one-time-nonce',
      }),
    ).toThrowError(BridgeBootstrapValidationError);
  });
});
