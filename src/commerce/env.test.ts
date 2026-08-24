import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAuthorizedWhatsappNumber,
} from './env';

describe('public commerce configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the explicitly authorized public defaults', () => {
    expect(getAuthorizedWhatsappNumber()).toBe('5492236216559');
  });

  it('can be disabled explicitly without falling back again', () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', '');
    expect(getAuthorizedWhatsappNumber()).toBeNull();
  });

  it('rejects an invalid WhatsApp value', () => {
    vi.stubEnv('VITE_WHATSAPP_NUMBER', 'not-a-number');

    expect(getAuthorizedWhatsappNumber()).toBeNull();
  });
});
