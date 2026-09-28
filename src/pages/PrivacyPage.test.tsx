import { render, screen, within } from '@testing-library/react';

import { PrivacyPage } from './PrivacyPage';

describe('Privacidad de la compra', () => {
  it('distingue navegación sin cuenta, datos de entrega y confirmación financiera', () => {
    render(<PrivacyPage navigate={vi.fn()} />);

    const personalData = screen.getByRole('region', { name: 'Datos personales' });
    expect(personalData).toHaveTextContent('sin crear una cuenta');
    expect(personalData).toHaveTextContent('nombre completo y celular');
    expect(personalData).toHaveTextContent('si elegís envío, también los datos de entrega');
    expect(personalData).toHaveTextContent('no solicita ni guarda datos de tarjeta');
    expect(personalData).not.toHaveTextContent('no solicita cuentas, nombre');

    const payments = screen.getByRole('region', { name: 'Carrito y pagos' });
    expect(payments).toHaveTextContent('volver a la tienda no confirma por sí solo un cobro');
    const requests = screen.getByRole('region', { name: 'Solicitudes registradas en la web' });
    expect(requests).toHaveTextContent('no se envían a WhatsApp por registrar la solicitud');
    expect(requests).toHaveTextContent('sin guardar los datos de entrega');
    expect(requests).toHaveTextContent('no confirma un cobro ni una reserva');

    expect(screen.getByRole('region', { name: 'Retención y eliminación' }))
      .toHaveTextContent('730 días');
    expect(within(screen.getByRole('region', { name: 'Tus controles' })).getByRole(
      'button', { name: 'Retirar consentimiento y eliminar sesión' },
    )).toBeEnabled();
  });
});
